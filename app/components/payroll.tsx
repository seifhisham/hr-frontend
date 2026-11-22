"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FileSpreadsheet } from "lucide-react";
import {
  ApiError,
  api,
  save,
  dateLabel,
  locationLabel,
  time,
  type Attendance,
  type DeductionAdjustment,
  type DeductionPolicy,
  type EmployeeRequest,
  type LateDeduction,
  type PayrollRow,
  type PayrollRun,
} from "../../lib/api";
import { Badge, Field, Modal } from "./modal";
import { BankPayroll } from "./bank-payroll";
import { RequestReview, requestNames } from "./requests";
import { PAGE_SIZES, Pager, pageSlice } from "./pager";

type RequestItem = PayrollRow["deductions"][number];
type Detail =
  | { kind: "request"; row: PayrollRow; item: RequestItem }
  | { kind: "late"; row: PayrollRow; item: LateDeduction };

const days = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;
const stamp = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const lateOutcome = (item: LateDeduction) =>
  item.exemption === "free-allowance"
    ? "free allowance"
    : item.exemption === "approved-request"
      ? "covered by approved request"
      : days(item.days);
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const money = (value: number | null, currency: string) =>
  value === null
    ? "Not configured"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

export function Payroll({
  canApprove = false,
  today,
  revision,
  onError,
}: {
  canApprove?: boolean;
  today: string;
  revision: number;
  onError: (error: unknown) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [approving, setApproving] = useState<PayrollRun | null>(null);
  const [bankExport, setBankExport] = useState(false);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    month: string;
    revision: number;
    version: number;
    run: PayrollRun;
  } | null>(null);
  const [failure, setFailure] = useState<{
    month: string;
    revision: number;
    version: number;
  } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  useEffect(() => {
    if (!month) return;
    let alive = true;
    api<PayrollRun>(`/payroll/run?month=${encodeURIComponent(month)}`)
      .then((run) => {
        if (alive) setResult({ month, revision, version, run });
      })
      .catch((error) => {
        if (alive) {
          setFailure({ month, revision, version });
          onError(error);
        }
      });
    return () => {
      alive = false;
    };
  }, [month, revision, version, onError]);
  const run =
    result?.month === month &&
    result.revision === revision &&
    result.version === version
      ? result.run
      : null;
  const rows = run?.rows ?? null;
  const visible = pageSlice(rows ?? [], page, pageSize);
  const failed =
    !rows &&
    failure?.month === month &&
    failure.revision === revision &&
    failure.version === version;
  const approvalHint = !rows?.length
    ? "No employees to approve for this month"
    : rows.some((row) => row.grossSalary === null)
      ? "Set missing salaries under Employees before approving"
      : month > today.slice(0, 7)
        ? "Approval is available when this month begins"
        : null;
  return (
    <section className="section">
      <div className="payroll-toolbar">
        <div className="payroll-toolbar-row">
          <div className="payroll-period">
            <Field label="Payroll month">
              <input
                type="month"
                name="payrollMonth"
                autoComplete="off"
                value={month}
                min="1000-01"
                max="9999-12"
                required
                onChange={(event) => {
                  setMonth(event.target.value);
                  setEditing(null);
                  setDetail(null);
                  setPage(1);
                  setApproving(null);
                  setBankExport(false);
                }}
              />
            </Field>
            {run && (
              <div className="payroll-run-state" aria-live="polite">
                <Badge
                  value={run.status === "approved" ? "approved" : "draft"}
                />
                <span>
                  {run.rows.length} {run.rows.length === 1 ? "employee" : "employees"}
                </span>
              </div>
            )}
          </div>
          <div className="payroll-actions">
            <button
              className="button secondary"
              type="button"
              disabled={!rows?.length}
              aria-haspopup="dialog"
              onClick={() => setBankExport(true)}
            >
              <FileSpreadsheet
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Bank payroll file
            </button>
            {canApprove && run?.status === "draft" && (
              <button
                className="button primary"
                type="button"
                disabled={!!approvalHint}
                aria-describedby={
                  approvalHint ? "payroll-approval-help" : undefined
                }
                onClick={() => setApproving(run)}
              >
                Approve and lock month
              </button>
            )}
          </div>
        </div>
        {canApprove && run?.status === "draft" && approvalHint && (
          <p
            className="payroll-approval-help"
            id="payroll-approval-help"
            role="status"
          >
            {approvalHint}
          </p>
        )}
      </div>
      {run?.status === "approved" && (
        <p className="message notice">
          {canApprove
            ? `Locked payroll approved by ${run.approvedBy}`
            : "Approved payroll for your permitted branch scope"}{" "}
          on{" "}
          {new Intl.DateTimeFormat("en", {
            timeZone: run.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(run.approvedAt!))}
          . {run.approvalReason ? `Reason: ${run.approvalReason}. ` : ""}These
          saved salaries and deductions will not change when employee records
          are edited.
        </p>
      )}
      <p className="muted">
        {run?.status === "approved"
          ? "Showing saved, approved payroll."
          : "Draft using current monthly salaries."}{" "}
        Daily rate = salary ÷ 30. Request deductions apply in the HR decision
        month, using the company timezone. The total deduction is rounded once;
        the displayed daily rate is rounded for reference. No tax, overtime, or
        partial-month calculation is included. HR deductions apply in the
        payroll month selected when entered.
      </p>
      {rows && rows.some((row) => row.grossSalary === null) && (
        <p className="message notice">
          Set missing salaries under Employees to calculate their payroll.
        </p>
      )}
      {month > today.slice(0, 7) && (
        <p className="message notice">
          Future months can be previewed; approval is available once the month
          begins.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Gross salary</th>
              <th>Daily rate</th>
              <th>Deduction days</th>
              <th>Deduction amount</th>
              <th>Net salary</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows && visible.rows.map((row) => (
              <tr key={row.employeeId}>
                <td>
                  <strong>{row.name}</strong>
                  <div>
                    {row.employeeNumber} / {row.department}
                    {row.active ? "" : " / Inactive"}
                  </div>
                </td>
                <td>{money(row.grossSalary, row.currency)}</td>
                <td>{money(row.dailyRate, row.currency)}</td>
                <td>
                  {row.deductionDays}
                  {row.deductions.length > 0 && (
                    <details>
                      <summary>Request breakdown</summary>
                      {row.deductions.map((item) => (
                        <button
                          key={item.requestId}
                          type="button"
                          className="payroll-item"
                          aria-haspopup="dialog"
                          title="View request details"
                          onClick={() =>
                            setDetail({ kind: "request", row, item })
                          }
                        >
                          {item.type ? `${requestNames[item.type]} · ` : ""}
                          {item.status}: {item.days}{" "}
                          {item.days === 1 ? "day" : "days"}
                          <br />
                          <span className="muted">View request details</span>
                        </button>
                      ))}
                    </details>
                  )}
                  {(row.lateDeductions?.length ?? 0) > 0 && (
                    <details>
                      <summary>Late arrivals</summary>
                      {row.lateDeductions!.map((item) => (
                        <button
                          key={item.attendanceId}
                          type="button"
                          className="payroll-item"
                          aria-haspopup="dialog"
                          title="View late arrival details"
                          onClick={() => setDetail({ kind: "late", row, item })}
                        >
                          {item.workDate}: {item.minutesLate} min late ·{" "}
                          {lateOutcome(item)}
                        </button>
                      ))}
                    </details>
                  )}
                  {row.manualDeductions.length > 0 && (
                    <details>
                      <summary>HR deductions</summary>
                      {row.manualDeductions.map((item) => (
                        <p key={item.id}>
                          <strong>
                            {item.days} {item.days === 1 ? "day" : "days"}
                          </strong>
                          <br />
                          Reason: {item.reason}
                          <br />
                          Approved by: {item.approvedBy}
                          <br />
                          Recorded by: {item.recordedBy}
                        </p>
                      ))}
                    </details>
                  )}
                </td>
                <td>{money(row.deductionAmount, row.currency)}</td>
                <td>
                  <strong>{money(row.netSalary, row.currency)}</strong>
                </td>
                <td>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={run?.status === "approved"}
                    onClick={() => setEditing(row)}
                  >
                    {run?.status === "approved" ? "Locked" : "Add deduction"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        label="Payroll pages"
        noun={["employee", "employees"]}
        page={visible.page}
        pages={visible.pages}
        start={visible.start}
        shown={visible.rows.length}
        total={visible.total}
        pageSize={visible.size}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
      {!rows && (
        <p role="status">
          {failed
            ? "Unable to load payroll. Use Refresh to retry."
            : month
              ? "Loading payroll..."
              : "Select a payroll month."}
        </p>
      )}
      {rows?.length === 0 && <p>No employees for this month.</p>}
      {bankExport && run && (
        <BankPayroll
          key={`${run.month}:${run.revision}`}
          run={run}
          today={today}
          close={() => setBankExport(false)}
        />
      )}
      {approving && (
        <ApprovalEditor
          run={approving}
          close={() => setApproving(null)}
          refresh={() => setVersion((value) => value + 1)}
        />
      )}
      {detail?.kind === "request" && run && (
        <RequestDetail
          key={detail.item.requestId}
          row={detail.row}
          item={detail.item}
          run={run}
          close={() => setDetail(null)}
        />
      )}
      {detail?.kind === "late" && run && (
        <LateArrivalDetail
          key={detail.item.attendanceId}
          row={detail.row}
          item={detail.item}
          run={run}
          close={() => setDetail(null)}
        />
      )}
      {editing && (
        <DeductionEditor
          employee={editing}
          close={() => setEditing(null)}
          saved={() => setVersion((value) => value + 1)}
        />
      )}
    </section>
  );
}

function ApprovalEditor({
  run,
  close,
  refresh,
}: {
  run: PayrollRun;
  close: () => void;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    setError("");
    try {
      await save("/payroll/approve", "POST", {
        month: run.month,
        expectedRevision: run.revision,
        reason,
      });
      refresh();
      close();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to approve payroll",
      );
      if (error instanceof ApiError && error.status === 409) {
        setStale(true);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Approve payroll for ${run.month}`}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={approve}>
        <div className="form-grid">
          <p>
            Approve and permanently lock the displayed payroll for{" "}
            {run.rows.length} employees. New deductions and reopening requests
            included in this payroll will be blocked. Future adjustments must
            use an unlocked month.
          </p>
          <Field label="Approval reason">
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              autoFocus
              disabled={busy || stale}
            />
          </Field>
        </div>
        {error && (
          <p className="message error" role="alert">
            {error}
            {stale && " Close this dialog and review the refreshed payroll."}
          </p>
        )}
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || stale}>
            {busy ? "Approving..." : "Approve and lock"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function DeductionEditor({
  employee,
  close,
  saved,
}: {
  employee: PayrollRow;
  close: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await save("/payroll/deductions", "POST", {
        employeeId: employee.employeeId,
        month: employee.month,
        days: Number(form.get("days")),
        reason: form.get("reason"),
        approvedBy: form.get("approvedBy"),
      });
      saved();
      close();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to add deduction",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add salary deduction"
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Employee">
            <span>
              {employee.name} / {employee.employeeNumber}
            </span>
          </Field>
          <Field label="Payroll month">
            <span>{employee.month}</span>
          </Field>
          <Field label="Salary days to deduct">
            <input
              name="days"
              type="number"
              min={1}
              max={365}
              step={1}
              required
              autoFocus
              disabled={busy}
            />
          </Field>
          <Field label="Approved by">
            <input
              name="approvedBy"
              placeholder="Approver's full name"
              required
              maxLength={120}
              disabled={busy}
            />
          </Field>
          <Field label="Reason">
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              disabled={busy}
            />
          </Field>
        </div>
        <p className="muted">
          This deduction will be added to payroll for {employee.month} at
          monthly salary ÷ 30 per day.
        </p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving..." : "Apply deduction"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function AdjustmentField({
  adjustment,
  timezone,
}: {
  adjustment: DeductionAdjustment;
  timezone: string;
}) {
  return (
    <Field label="Deduction adjustment">
      <span className="request-reason">
        Changed from {days(adjustment.originalDays)} by {adjustment.by},{" "}
        {stamp(adjustment.at, timezone)}
        <br />
        Reason: {adjustment.reason}
      </span>
    </Field>
  );
}

function PayrollFields({
  row,
  item,
  run,
}: {
  row: PayrollRow;
  item: { days: number; adjustment?: DeductionAdjustment | null };
  run: PayrollRun;
}) {
  return (
    <>
      <Field label={`Applied in ${run.month} payroll`}>
        <span>
          {days(item.days)}
          {row.dailyRate !== null &&
            item.days > 0 &&
            ` · about ${money(
              Math.round(row.dailyRate * item.days * 100) / 100,
              row.currency,
            )}`}
          {run.status === "approved" && " (approved and locked)"}
        </span>
      </Field>
      {item.adjustment && (
        <AdjustmentField adjustment={item.adjustment} timezone={run.timezone} />
      )}
    </>
  );
}

function DetailState({
  title,
  error,
  close,
}: {
  title: string;
  error: string;
  close: () => void;
}) {
  return (
    <Modal title={title} close={close}>
      <div className="form-grid">
        {error ? (
          <p className="message error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Loading details...</p>
        )}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={close}>
          Close
        </button>
      </footer>
    </Modal>
  );
}

function RequestDetail({
  row,
  item,
  run,
  close,
}: {
  row: PayrollRow;
  item: RequestItem;
  run: PayrollRun;
  close: () => void;
}) {
  const [request, setRequest] = useState<EmployeeRequest | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<EmployeeRequest>(`/requests/${encodeURIComponent(item.requestId)}`)
      .then((value) => {
        if (alive) setRequest(value);
      })
      .catch((e) => {
        if (alive) setError(message(e, "Unable to load request"));
      });
    return () => {
      alive = false;
    };
  }, [item.requestId]);
  if (!request)
    return (
      <DetailState
        title={item.type ? requestNames[item.type] : "Request details"}
        error={error}
        close={close}
      />
    );
  return (
    <RequestReview
      request={request}
      timezone={run.timezone}
      canDecide={false}
      canWithdraw={false}
      canManagerReview={false}
      close={close}
      saved={async () => {}}
      extra={
        <>
          <PayrollFields row={row} item={item} run={run} />
          {item.decidedAt && (
            <Field label="Counted in payroll from">
              <span>HR decision on {stamp(item.decidedAt, run.timezone)}</span>
            </Field>
          )}
        </>
      }
    />
  );
}

function LateArrivalDetail({
  row,
  item,
  run,
  close,
}: {
  row: PayrollRow;
  item: LateDeduction;
  run: PayrollRun;
  close: () => void;
}) {
  const [record, setRecord] = useState<Attendance | null>(null);
  const [policy, setPolicy] = useState<DeductionPolicy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({
      from: item.workDate,
      to: item.workDate,
      employeeId: row.employeeId,
    });
    api<Attendance[]>(`/attendance?${query}`)
      .then((rows) => {
        if (!alive) return;
        const found = rows.find((r) => r.id === item.attendanceId);
        if (found) setRecord(found);
        else setError("This attendance record is no longer available.");
      })
      .catch((e) => {
        if (alive) setError(message(e, "Unable to load attendance"));
      });
    api<DeductionPolicy>("/deduction-policy")
      .then((value) => {
        if (alive) setPolicy(value);
      })
      // The rule summary is optional context.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [item.attendanceId, item.workDate, row.employeeId]);
  const title = `Late arrival · ${dateLabel(item.workDate)}`;
  if (!record) return <DetailState title={title} error={error} close={close} />;
  const late = policy?.lateArrival;
  const location = locationLabel(record);
  return (
    <Modal title={title} close={close}>
      <div className="form-grid">
        <Field label="Employee">
          <span>
            {row.name} / {row.employeeNumber} / {row.department}
          </span>
        </Field>
        <Field label="Status">
          <Badge value={record.status} />
        </Field>
        <Field label="Work date">
          <span>{dateLabel(record.workDate)}</span>
        </Field>
        {record.branchName && (
          <Field label="Branch">
            <span>{record.branchName}</span>
          </Field>
        )}
        <Field label="Check-in">
          <span>
            {time(record.checkIn, record.timezone)} ({record.timezone})
          </span>
        </Field>
        <Field label="Check-out">
          <span>{time(record.checkOut, record.timezone)}</span>
        </Field>
        <Field label="Hours worked">
          <span>{record.hours ?? "Not checked out"}</span>
        </Field>
        {location && (
          <Field label="Location">
            <span>{location}</span>
          </Field>
        )}
        <Field label="Minutes late">
          <span>{item.minutesLate} min</span>
        </Field>
        <Field label="Payroll outcome">
          <span>
            {item.exemption === "free-allowance"
              ? `No deduction: within the free allowance${
                  late ? ` of ${late.freeLatesPerMonth} per month` : ""
                }`
              : item.exemption === "approved-request"
                ? "No deduction: covered by an approved request for this date"
                : `Deducted by the late-arrival rules${
                    item.automaticDays !== undefined
                      ? `: ${days(item.automaticDays)}`
                      : ""
                  }`}
          </span>
        </Field>
        <PayrollFields row={row} item={item} run={run} />
        {late && (
          <Field label="Current late-arrival rules">
            <span className="request-reason">
              {late.enabled
                ? `${late.freeLatesPerMonth} free per month${
                    late.exemptApprovedRequests
                      ? "; dates covered by approved requests are exempt"
                      : ""
                  }. ${late.tiers
                    .map((t) => `${t.fromMinutes}+ min: ${days(t.days)}`)
                    .join(", ")}`
                : "Late-arrival deductions are currently off"}
            </span>
          </Field>
        )}
        {run.status === "approved" && (
          <p className="muted">
            Payroll values are as approved. Attendance shows the current
            record, which may have been corrected since.
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={close}>
          Close
        </button>
      </footer>
    </Modal>
  );
}
