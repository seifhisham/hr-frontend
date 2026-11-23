"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Camera, Paperclip } from "lucide-react";
import {
  api,
  apiPage,
  dateLabel,
  initials,
  locationLabel,
  time,
  type Attendance,
  type Audit,
  type BankDetails,
  type Branch,
  type Employee,
  type EmployeeRequest,
  type PayrollRun,
  type SalesActivity,
  type SalesPerformance,
  type Schedule,
} from "../../lib/api";
import { auditFields, auditLabel } from "../../lib/audit-display";
import { Badge, Field, Modal } from "./modal";

const tabs = ["Profile", "Attendance", "Requests", "Payroll", "Sales", "Activity"] as const;
type Tab = (typeof tabs)[number];
const ATTENDANCE_WINDOW_DAYS = 93;
const PAGE_SIZE = 50;

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
/** The API caps reports at 93 days, so history is read in windows, newest first. */
export function attendanceWindow(today: string, startDate: string, index: number) {
  const to = addDays(today, -ATTENDANCE_WINDOW_DAYS * index);
  if (to < startDate) return null;
  const earliest = addDays(to, -(ATTENDANCE_WINDOW_DAYS - 1));
  return { from: earliest < startDate ? startDate : earliest, to };
}
/** Months from today's back to the employee's start month, newest first. */
export function employmentMonths(today: string, startDate: string) {
  const last = today.slice(0, 7);
  const first = startDate.slice(0, 7) > last ? last : startDate.slice(0, 7);
  const months: string[] = [];
  let [year, month] = last.split("-").map(Number);
  for (let value = last; value >= first; ) {
    months.push(value);
    month -= 1;
    if (!month) {
      month = 12;
      year -= 1;
    }
    value = `${year}-${String(month).padStart(2, "0")}`;
  }
  return months;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not load this information.";

/** Failures stay in the tab: the dashboard handler would sign the user out on 403. */
function useRest<T>(path: string) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    api<T>(path)
      .then((data) => alive && setState({ path, data }))
      .catch((error) => alive && setState({ path, error: message(error) }));
    return () => {
      alive = false;
    };
  }, [path, attempt]);
  const current = state?.path === path ? state : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => {
      setState(null);
      setAttempt((value) => value + 1);
    },
  };
}
function useCursor<T extends { id: string }>(base: string) {
  const [pages, setPages] = useState<T[][]>([]);
  const [wanted, setWanted] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const last = pages.at(-1);
  const ended = !!last && last.length < PAGE_SIZE;
  const before = last?.at(-1)?.id;
  const loading = !error && !ended && pages.length < wanted;
  useEffect(() => {
    if (!loading) return;
    let alive = true;
    const index = pages.length;
    const query = `limit=${PAGE_SIZE}${before ? `&before=${before}` : ""}`;
    apiPage<T>(`${base}${base.includes("?") ? "&" : "?"}${query}`)
      .then((page) => {
        if (!alive) return;
        setPages((current) => (current.length === index ? [...current, page.rows] : current));
        if (page.total !== null) setTotal(page.total);
      })
      .catch((failure) => alive && setError(message(failure)));
    return () => {
      alive = false;
    };
  }, [base, before, loading, pages.length]);
  return {
    rows: pages.flat(),
    total,
    error,
    loading,
    hasMore: !!last && !ended,
    more: () => {
      setError("");
      setWanted(pages.length + 1);
    },
  };
}
function Status({ loading, error, retry, empty }: { loading?: boolean; error?: string; retry?: () => void; empty?: string | false }) {
  if (error)
    return (
      <div className="message error" role="alert">
        <span>{error}</span>
        {retry && <button className="text-button" onClick={retry}>Try again</button>}
      </div>
    );
  if (loading) return <p className="muted profile-state" role="status">Loading...</p>;
  return empty ? <p className="muted profile-state">{empty}</p> : null;
}
function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="profile-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === "" ? "Not set" : value}</dd>
        </div>
      ))}
    </dl>
  );
}
const stamp = (value: string | null | undefined, timezone: string) =>
  value
    ? new Intl.DateTimeFormat("en", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not set";
const money = (value: number | null | undefined, currency: string) =>
  value === null || value === undefined ? "Not set" : `${value.toLocaleString("en", { maximumFractionDigits: 2 })} ${currency}`;

function ProfileTab({ employee, employees, schedules, branches, timezone }: { employee: Employee; employees: Employee[]; schedules: Schedule[]; branches: Branch[]; timezone: string }) {
  const branchHistory = useRest<{ branchId: string; effectiveFrom: string; code: string; name: string }[]>(`/employees/${employee.id}/branches`);
  const scheduleHistory = useRest<{ effectiveFrom: string; schedule: Schedule }[]>(`/employees/${employee.id}/schedules`);
  return (
    <div className="profile-stack">
      <Facts
        items={[
          ["Employee number", employee.employeeNumber],
          ["National ID", employee.nationalId],
          ["Email", employee.email],
          ["Role", employee.role],
          ["Department", employee.department],
          ["Job title", employee.jobTitle],
          ["Start date", dateLabel(employee.startDate)],
          ["Direct manager", employees.find((e) => e.id === employee.managerId)?.name],
          ["Current branch", branches.find((b) => b.id === employee.branchId)?.name],
          ["Current schedule", schedules.find((s) => s.id === employee.scheduleId)?.name],
          ["Monthly salary", money(employee.monthlySalary, employee.salaryCurrency)],
          ["Sales access", employee.salesEnabled ? "Enabled" : "Disabled"],
          ["Account UUID", employee.accountId ? <code key="id">{employee.accountId}</code> : "No linked account"],
          ["Deleted", employee.deletedAt ? stamp(employee.deletedAt, timezone) : "No"],
        ]}
      />
      <div className="profile-columns">
        <section>
          <h3>Branch history</h3>
          <Status {...branchHistory} empty={branchHistory.data?.length === 0 && "No branch history."} />
          {[...(branchHistory.data ?? [])].reverse().map((row) => (
            <div className="profile-line" key={`${row.branchId}-${row.effectiveFrom}`}>
              <strong>{row.name} ({row.code})</strong>
              <span>From {dateLabel(row.effectiveFrom)}</span>
            </div>
          ))}
        </section>
        <section>
          <h3>Schedule history</h3>
          <Status {...scheduleHistory} empty={scheduleHistory.data?.length === 0 && "No schedule history."} />
          {[...(scheduleHistory.data ?? [])].reverse().map((row) => (
            <div className="profile-line" key={row.effectiveFrom}>
              <strong>{row.schedule.name} ({row.schedule.start}-{row.schedule.end})</strong>
              <span>From {dateLabel(row.effectiveFrom)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
type Evidence = { event: string; distanceMeters: number; accuracyMeters: number; capturedAt: string; photoUrl: string };
function EvidencePanel({ id, timezone }: { id: string; timezone: string }) {
  const evidence = useRest<Evidence[]>(`/attendance/${id}/evidence`);
  return (
    <div className="profile-evidence">
      <Status {...evidence} empty={evidence.data?.length === 0 && "No photo or location evidence. This may be a manual record."} />
      {evidence.data?.map((row) => (
        <figure key={row.event}>
          {/* Private, authenticated API image; it must not pass through an image cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.photoUrl} alt={`${row.event} evidence`} loading="lazy" />
          <figcaption>
            <strong>{row.event === "check-in" ? "Check-in" : "Check-out"}</strong>
            <span>{stamp(row.capturedAt, timezone)}</span>
            <span>{Math.round(row.distanceMeters)} m from office, accuracy {Math.round(row.accuracyMeters)} m</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
function AttendanceTab({ employee, today, timezone }: { employee: Employee; today: string; timezone: string }) {
  const [pages, setPages] = useState<Attendance[][]>([]);
  const [wanted, setWanted] = useState(1);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const next = attendanceWindow(today, employee.startDate, pages.length);
  const loading = !error && !!next && pages.length < wanted;
  const from = next?.from;
  const to = next?.to;
  useEffect(() => {
    if (!loading || !from || !to) return;
    let alive = true;
    const index = pages.length;
    const query = new URLSearchParams({ from, to, employeeId: employee.id });
    api<Attendance[]>(`/attendance?${query}`)
      .then((rows) => {
        if (alive) setPages((current) => (current.length === index ? [...current, rows] : current));
      })
      .catch((failure) => alive && setError(message(failure)));
    return () => {
      alive = false;
    };
  }, [employee.id, from, to, loading, pages.length]);
  const rows = pages
    .flat()
    .filter((row) => row.status !== "Not scheduled")
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const covered = pages.length ? attendanceWindow(today, employee.startDate, pages.length - 1)?.from : null;
  return (
    <div className="profile-stack">
      <div className="profile-summary">
        {([
          ["Days present", rows.filter((row) => row.checkIn).length],
          ["Late", rows.filter((row) => row.late).length],
          ["Missing check-out", count("Missing check-out")],
          ["No record", count("No record")],
          ["Hours", Math.round(rows.reduce((sum, row) => sum + (row.hours ?? 0), 0) * 100) / 100],
        ] as const).map(([label, value]) => (
          <div key={label}><strong>{value}</strong><span>{label}</span></div>
        ))}
      </div>
      {covered && <p className="muted profile-note">Showing {dateLabel(covered)} to {dateLabel(today)}. Totals cover this period.</p>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Workday</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Status</th><th>Branch</th><th aria-label="Evidence" /></tr></thead>
            <tbody>
              {rows.map((row) => {
                const key = row.id ?? row.workDate;
                return [
                  <tr key={key}>
                    <td>{dateLabel(row.workDate)}</td>
                    <td>{time(row.checkIn, row.timezone || timezone)}</td>
                    <td>{time(row.checkOut, row.timezone || timezone)}{locationLabel(row) && <small className="profile-sub">{locationLabel(row)}</small>}</td>
                    <td>{row.hours ?? "--"}</td>
                    <td><Badge value={row.status} /></td>
                    <td>{row.branchName ?? "--"}</td>
                    <td>
                      {row.id && (
                        <button className="icon-button" title="Photos and location" aria-label={`Photos and location for ${row.workDate}`} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}>
                          <Camera size={16} />
                        </button>
                      )}
                    </td>
                  </tr>,
                  open === row.id && row.id ? (
                    <tr key={`${key}-evidence`}><td colSpan={7}><EvidencePanel id={row.id} timezone={timezone} /></td></tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <Status loading={loading} error={error} retry={() => setError("")} empty={!loading && !rows.length && "No attendance in this period."} />
      {next && !loading && !error && pages.length > 0 && (
        <button className="button secondary profile-more" onClick={() => setWanted(pages.length + 1)}>Load earlier attendance</button>
      )}
    </div>
  );
}
const requestNames: Record<EmployeeRequest["type"], string> = {
  leave: "Vacation", holiday: "Holiday", sick: "Sick leave", unpaid: "Unpaid leave", urgent: "Urgent leave",
  excuse: "Excuse", mission: "Mission", "forgotten-check-out": "Forgotten check-out",
};
function RequestsTab({ employee, timezone }: { employee: Employee; timezone: string }) {
  const list = useCursor<EmployeeRequest>(`/requests?employeeId=${employee.id}`);
  return (
    <div className="profile-stack">
      {list.total !== null && <p className="muted profile-note">{list.rows.length} of {list.total} requests</p>}
      {list.rows.map((request) => (
        <article className="profile-card" key={request.id}>
          <header>
            <strong>{requestNames[request.type]}</strong>
            <Badge value={request.status} />
          </header>
          <p>{request.reason}</p>
          <Facts
            items={[
              ["Period", request.from ? `${dateLabel(request.from)}${request.to && request.to !== request.from ? ` to ${dateLabel(request.to)}` : ""}` : request.attendance ? dateLabel(request.attendance.workDate) : null],
              ...(request.proposedCheckOut ? [["Proposed check-out", stamp(request.proposedCheckOut, timezone)] as [string, ReactNode]] : []),
              ...(request.durationMinutes ? [["Duration", `${request.durationMinutes} minutes`] as [string, ReactNode]] : []),
              ["Submitted", stamp(request.submittedAt, timezone)],
              ["Decided", request.decidedAt ? `${stamp(request.decidedAt, timezone)} by ${request.decidedBy ?? "Unknown"}` : "Not decided"],
              ["Salary deduction", request.salaryDeductionDays === null ? "None" : `${request.salaryDeductionDays} days`],
            ]}
          />
          {request.managerReview && <p className="profile-sub">Manager {request.managerReview.status} ({request.managerReview.reviewedBy}): {request.managerReview.reason}</p>}
          {request.decisionReason && <p className="profile-sub">Decision: {request.decisionReason}</p>}
          {request.lastChange && <p className="profile-sub">{request.lastChange.action === "withdraw" ? "Withdrawn" : "Reopened"} by {request.lastChange.by}: {request.lastChange.reason}</p>}
          {!!request.attachments?.length && (
            <div className="profile-files">
              {request.attachments.map((file) => (
                <a key={file.name} href={`data:${file.mimeType};base64,${file.content}`} download={file.name}><Paperclip size={14} />{file.name}</a>
              ))}
            </div>
          )}
        </article>
      ))}
      <Status loading={list.loading} error={list.error} retry={list.more} empty={!list.loading && !list.rows.length && "No requests."} />
      {list.hasMore && !list.loading && <button className="button secondary profile-more" onClick={list.more}>Load more requests</button>}
    </div>
  );
}
function MonthSelect({ months, value, change }: { months: string[]; value: string; change: (month: string) => void }) {
  return (
    <div className="profile-toolbar">
      <Field label="Month">
        <select value={value} onChange={(event) => change(event.target.value)}>
          {months.map((month) => <option key={month}>{month}</option>)}
        </select>
      </Field>
    </div>
  );
}
function PayrollTab({ employee, today }: { employee: Employee; today: string }) {
  const months = employmentMonths(today, employee.startDate);
  const [month, setMonth] = useState(months[0]);
  const run = useRest<PayrollRun>(`/payroll/run?month=${month}`);
  const bank = useRest<BankDetails>("/payroll/bank-details");
  const row = run.data?.rows.find((item) => item.employeeId === employee.id);
  const account = bank.data?.employees.find((item) => item.employeeId === employee.id);
  return (
    <div className="profile-stack">
      <MonthSelect months={months} value={month} change={setMonth} />
      <Status {...run} empty={!!run.data && !row && "No payroll row for this month."} />
      {row && (
        <>
          <Facts
            items={[
              ["Payroll status", run.data?.status],
              ["Gross salary", money(row.grossSalary, row.currency)],
              ["Daily rate", money(row.dailyRate, row.currency)],
              ["Deduction days", row.deductionDays],
              ["Deduction amount", money(row.deductionAmount, row.currency)],
              ["Net salary", money(row.netSalary, row.currency)],
            ]}
          />
          <section>
            <h3>Deductions</h3>
            {!row.deductions.length && !row.manualDeductions.length && !row.lateDeductions?.length && !row.absenceDeductions?.length && <p className="muted">No deductions this month.</p>}
            {row.deductions.map((item) => (
              <div className="profile-line" key={item.requestId}><strong>{item.type ? requestNames[item.type] : "Request"} ({item.status})</strong><span>{item.days} days</span></div>
            ))}
            {row.lateDeductions?.map((item) => (
              <div className="profile-line" key={item.attendanceId}><strong>Late {item.minutesLate} min, {dateLabel(item.workDate)}</strong><span>{item.days} days{item.exemption ? " (exempt)" : ""}</span></div>
            ))}
            {row.absenceDeductions?.map((item) => (
              <div className="profile-line" key={item.workDate}><strong>Absence, {dateLabel(item.workDate)}</strong><span>{item.days} days{item.status === "held" ? " (held for review)" : item.status === "covered" ? " (covered by request)" : ""}</span></div>
            ))}
            {row.manualDeductions.map((item) => (
              <div className="profile-line" key={item.id}><strong>{item.reason}</strong><span>{item.days} days, approved by {item.approvedBy}</span></div>
            ))}
          </section>
        </>
      )}
      <section>
        <h3>Bank details</h3>
        <Status {...bank} empty={!!bank.data && !account && "No saved bank details."} />
        {account && <Facts items={[["Beneficiary", account.beneficiaryName], ["Account", account.account], ["SWIFT", account.swift]]} />}
      </section>
    </div>
  );
}
function SalesTab({ employee, today }: { employee: Employee; today: string }) {
  const months = employmentMonths(today, employee.startDate);
  const [month, setMonth] = useState(months[0]);
  const query = `month=${month}&employeeId=${employee.id}`;
  const performance = useRest<SalesPerformance[]>(`/sales/performance?${query}`);
  const activities = useRest<SalesActivity[]>(`/sales/activities?${query}`);
  const summary = performance.data?.[0];
  return (
    <div className="profile-stack">
      <MonthSelect months={months} value={month} change={setMonth} />
      <Status {...performance} />
      {summary && (
        <div className="profile-summary">
          {([["Meetings", summary.meetings], ["Viewings", summary.viewings], ["Deals", summary.deals], ["Pending", summary.pending], ["Returned", summary.returned]] as const).map(([label, value]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
        </div>
      )}
      <Status {...activities} empty={activities.data?.length === 0 && "No sales activity this month."} />
      {activities.data?.map((activity) => (
        <article className="profile-card" key={activity.id}>
          <header><strong>{auditLabel(activity.kind)}: {activity.clientName}</strong><Badge value={activity.status} /></header>
          <p>{dateLabel(activity.activityDate)} / {activity.projectName}{activity.kind === "closed-deal" ? ` / ${money(activity.value, activity.currency)}` : ""}</p>
          {activity.notes && <p className="profile-sub">{activity.notes}</p>}
          {activity.review && <p className="profile-sub">Review by {activity.review.by}: {activity.review.reason}</p>}
        </article>
      ))}
    </div>
  );
}
function ActivityTab({ employee, timezone }: { employee: Employee; timezone: string }) {
  const list = useCursor<Audit>(`/audit?search=${employee.id}`);
  return (
    <div className="profile-stack">
      {list.rows.map((event) => {
        const changes = auditFields(event.after);
        return (
          <article className="profile-card" key={event.id}>
            <header><strong>{auditLabel(event.action)}</strong><span className="muted">{stamp(event.at, timezone)}</span></header>
            <p className="profile-sub">By {event.actor}{event.reason ? `: ${event.reason}` : ""}</p>
            {changes.length > 0 && (
              <details>
                <summary>Details</summary>
                <Facts items={changes.map((change) => [change.field, change.value])} />
              </details>
            )}
          </article>
        );
      })}
      <Status loading={list.loading} error={list.error} retry={list.more} empty={!list.loading && !list.rows.length && "No recorded activity."} />
      {list.hasMore && !list.loading && <button className="button secondary profile-more" onClick={list.more}>Load more activity</button>}
    </div>
  );
}
export function EmployeeProfile({ employee, employees, schedules, branches, today, timezone, close }: {
  employee: Employee;
  employees: Employee[];
  schedules: Schedule[];
  branches: Branch[];
  today: string;
  timezone: string;
  close: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Profile");
  return (
    <Modal title="Employee history" close={close} className="employee-profile-modal">
      <div className="profile-hero">
        <span className="avatar">{initials(employee.name)}</span>
        <div>
          <strong>{employee.name}</strong>
          <span>{employee.employeeNumber} / {employee.jobTitle} / {employee.department}</span>
        </div>
        <Badge value={employee.active ? "Active" : "Inactive"} />
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Employee history sections">
        {tabs.map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      <div className="profile-body" role="tabpanel" aria-label={tab}>
        {tab === "Profile" && <ProfileTab employee={employee} employees={employees} schedules={schedules} branches={branches} timezone={timezone} />}
        {tab === "Attendance" && <AttendanceTab employee={employee} today={today} timezone={timezone} />}
        {tab === "Requests" && <RequestsTab employee={employee} timezone={timezone} />}
        {tab === "Payroll" && <PayrollTab employee={employee} today={today} />}
        {tab === "Sales" && <SalesTab employee={employee} today={today} />}
        {tab === "Activity" && <ActivityTab employee={employee} timezone={timezone} />}
      </div>
    </Modal>
  );
}
