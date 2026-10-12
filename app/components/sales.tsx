"use client";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import {
  api,
  send,
  ApiError,
  dateLabel,
  type SalesActivity,
  type SalesActivityInput,
  type SalesAccess,
  type SalesPerformance,
} from "../../lib/api";
import { Field, Modal } from "./modal";

const names = {
  meeting: "Client meeting",
  viewing: "Property viewing",
  "closed-deal": "Signed deal",
};
const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const progress = (actual: number, goal?: number, percentage?: number | null) =>
  goal ? `${actual} / ${goal} (${percentage ?? 0}%)` : `${actual} — no target`;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save sales activity";

function ActivityForm({
  record,
  today,
  saved,
  close,
  onError,
}: {
  record: SalesActivity | null;
  today: string;
  saved: () => void;
  close: () => void;
  onError: (error: unknown) => void;
}) {
  const [kind, setKind] = useState<SalesActivityInput["kind"]>(
    record?.kind ?? "meeting",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<{
    id: string;
    activity: SalesActivityInput;
  } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const common = {
      activityDate: value("activityDate"),
      clientName: value("clientName"),
      projectName: value("projectName"),
      propertyReference: value("propertyReference"),
      notes: value("notes"),
    };
    const activity: SalesActivityInput =
      kind === "closed-deal"
        ? {
            ...common,
            kind,
            dealReference: value("dealReference"),
            transactionType: value("transactionType") as "sale" | "lease",
            value: Number(value("value")),
            currency: value("currency").toUpperCase(),
          }
        : {
            ...common,
            kind,
            purpose: value("purpose"),
            outcome: value("outcome"),
            followUpDate: value("followUpDate") || null,
          };
    setBusy(true);
    setError("");
    try {
      if (record) {
        await send(`/sales/activities/${record.id}`, "PATCH", {
          expectedRevision: record.revision,
          activity,
        });
      } else {
        // Keep the same ID and payload after an uncertain response; changing them could create a duplicate.
        if (
          submission.current &&
          JSON.stringify(submission.current.activity) !==
            JSON.stringify(activity)
        )
          throw new Error(
            "A previous submission has an uncertain outcome. Close this form and refresh your history before changing or resubmitting it.",
          );
        submission.current ??= { id: crypto.randomUUID(), activity };
        await send("/sales/activities", "POST", submission.current);
      }
      saved();
      close();
    } catch (error) {
      setError(message(error));
      onError(error);
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      )
        submission.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Correct sales activity" : "Register sales activity"}
      close={close}
    >
      <p>
        Signed deals require a signed sale or lease contract. Activities count
        toward performance after verification.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="form-grid sales-form">
          <Field label="Activity">
            <select
              aria-label="Activity"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as SalesActivityInput["kind"])
              }
            >
              {Object.entries(names).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity / contract date">
            <input
              name="activityDate"
              type="date"
              defaultValue={record?.activityDate ?? today}
              max={today}
              required
            />
          </Field>
          <Field label="Client name">
            <input
              name="clientName"
              defaultValue={record?.clientName}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Project / compound (optional)">
            <input
              name="projectName"
              defaultValue={record?.projectName}
              maxLength={120}
            />
          </Field>
          <Field
            label={`Property / unit reference${kind === "meeting" ? " (optional)" : ""}`}
          >
            <input
              name="propertyReference"
              defaultValue={record?.propertyReference}
              maxLength={120}
              required={kind !== "meeting"}
            />
          </Field>
          {kind === "closed-deal" ? (
            <Fragment key="deal">
              <Field label="Contract / deal reference">
                <input
                  name="dealReference"
                  defaultValue={
                    record?.kind === "closed-deal" ? record.dealReference : ""
                  }
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Transaction">
                <select
                  aria-label="Transaction"
                  name="transactionType"
                  defaultValue={
                    record?.kind === "closed-deal"
                      ? record.transactionType
                      : "sale"
                  }
                >
                  <option value="sale">Sale</option>
                  <option value="lease">Lease</option>
                </select>
              </Field>
              <Field label="Total signed contract value">
                <input
                  name="value"
                  type="number"
                  min="0.01"
                  max="1000000000"
                  step="0.01"
                  defaultValue={
                    record?.kind === "closed-deal" ? record.value : ""
                  }
                  required
                />
              </Field>
              <Field label="Currency">
                <input
                  name="currency"
                  defaultValue={
                    record?.kind === "closed-deal" ? record.currency : "EGP"
                  }
                  pattern="[A-Za-z]{3}"
                  maxLength={3}
                  required
                />
              </Field>
            </Fragment>
          ) : (
            <Fragment key="meeting">
              <Field label="Purpose">
                <input
                  name="purpose"
                  defaultValue={
                    record && record.kind !== "closed-deal"
                      ? record.purpose
                      : ""
                  }
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Outcome">
                <input
                  name="outcome"
                  defaultValue={
                    record && record.kind !== "closed-deal"
                      ? record.outcome
                      : ""
                  }
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Next follow-up (optional)">
                <input
                  name="followUpDate"
                  type="date"
                  defaultValue={
                    record && record.kind !== "closed-deal"
                      ? (record.followUpDate ?? "")
                      : ""
                  }
                />
              </Field>
            </Fragment>
          )}
          <Field label="Notes (optional)">
            <textarea
              name="notes"
              defaultValue={record?.notes}
              maxLength={1000}
              rows={3}
            />
          </Field>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Submitting..." : "Submit for verification"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function TargetForm({
  row,
  saved,
  close,
  onError,
}: {
  row: SalesPerformance;
  saved: () => void;
  close: () => void;
  onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hasValue = form.get("transactionValue") !== "";
    setBusy(true);
    setError("");
    try {
      await send("/sales/targets", "POST", {
        employeeId: row.employeeId,
        month: row.month,
        meetings: Number(form.get("meetings")),
        deals: Number(form.get("deals")),
        transactionValue: hasValue
          ? Number(form.get("transactionValue"))
          : null,
        currency: hasValue
          ? String(form.get("currency")).trim().toUpperCase()
          : null,
        expectedRevision: row.target?.revision ?? 0,
        reason: form.get("reason"),
      });
      saved();
      close();
    } catch (error) {
      setError(message(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Monthly targets / ${row.employeeName}`} close={close}>
      <p>
        {row.month}. Meetings and viewings share one target. Contract value is
        separate from company revenue or commission.
      </p>
      <form onSubmit={submit}>
        <fieldset className="form-grid sales-form" disabled={busy}>
          <Field label="Meetings / viewings">
            <input
              name="meetings"
              type="number"
              min={0}
              max={10000}
              step={1}
              required
              defaultValue={row.target?.meetings ?? 0}
            />
          </Field>
          <Field label="Signed deals">
            <input
              name="deals"
              type="number"
              min={0}
              max={10000}
              step={1}
              required
              defaultValue={row.target?.deals ?? 0}
            />
          </Field>
          <Field label="Contract value target (optional)">
            <input
              name="transactionValue"
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              defaultValue={row.target?.transactionValue ?? ""}
            />
          </Field>
          <Field label="Value target currency">
            <input
              name="currency"
              defaultValue={row.target?.currency ?? "EGP"}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
            />
          </Field>
          <Field label="Reason for target change">
            <textarea
              name="reason"
              minLength={5}
              maxLength={500}
              required
              rows={3}
            />
          </Field>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving..." : "Save targets"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ReviewForm({
  record,
  status,
  saved,
  close,
  onError,
}: {
  record: SalesActivity;
  status: "verified" | "returned";
  saved: () => void;
  close: () => void;
  onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    setError("");
    try {
      await send(`/sales/activities/${record.id}/review`, "PATCH", {
        status,
        reason,
        expectedRevision: record.revision,
      });
      saved();
      close();
    } catch (error) {
      setError(message(error));
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        status === "verified" ? "Verify activity" : "Return for correction"
      }
      close={close}
    >
      <p>
        {record.employeeName} / {names[record.kind]} / {record.clientName}
      </p>
      <p>
        {status === "verified"
          ? "Confirm this activity occurred. For a deal, confirm the sale or lease contract is signed."
          : "Returning an activity removes it from verified performance until corrected and verified again."}
      </p>
      <form onSubmit={submit}>
        <Field label="Review reason">
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            disabled={busy}
          />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Saving..."
              : status === "verified"
                ? "Verify"
                : "Return for correction"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function Sales({
  today,
  timezone,
  employeeId,
  personal = false,
  revision = 0,
  onError,
}: {
  today: string;
  timezone: string;
  employeeId: string | null;
  personal?: boolean;
  revision?: number;
  onError: (error: unknown) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [own, setOwn] = useState(personal);
  const [version, setVersion] = useState(0);
  const [department, setDepartment] = useState("");
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{
    key: string;
    access: SalesAccess;
    activities: SalesActivity[];
    performance: SalesPerformance[];
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [activity, setActivity] = useState<SalesActivity | "new" | null>(null);
  const [target, setTarget] = useState<SalesPerformance | null>(null);
  const [review, setReview] = useState<{
    record: SalesActivity;
    status: "verified" | "returned";
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const key = JSON.stringify([month, own, version, revision]);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  useEffect(() => {
    if (!validMonth) return;
    let alive = true;
    const query = new URLSearchParams({ month });
    Promise.all([
      api<SalesAccess>("/sales/access"),
      api<SalesActivity[]>(`/sales/activities${own ? "/me" : ""}?${query}`),
      api<SalesPerformance[]>(`/sales/performance${own ? "/me" : ""}?${query}`),
    ])
      .then(([access, activities, performance]) => {
        if (alive) {
          setResult({ key, access, activities, performance });
          setFailure(null);
        }
      })
      .catch((error) => {
        if (alive) {
          setFailure({ key, message: message(error) });
          onError(error);
        }
      });
    return () => {
      alive = false;
    };
  }, [key, month, own, validMonth, onError]);
  const current = result?.key === key && failure?.key !== key ? result : null;
  const refresh = () => setVersion((value) => value + 1);
  const visible = (row: { department: string; employeeId: string }) =>
    (own || !department || row.department === department) &&
    (own || !person || row.employeeId === person);
  const performance = current?.performance.filter(visible) ?? [];
  const activities =
    current?.activities.filter(
      (row) =>
        visible(row) &&
        (!kind || row.kind === kind) &&
        (!status || row.status === status),
    ) ?? [];
  async function exportCsv() {
    setExporting(true);
    try {
      const query = new URLSearchParams({
        month,
        ...(department ? { department } : {}),
        ...(person ? { employeeId: person } : {}),
      });
      const response = await fetch(`/api/sales/export?${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
          body?.message ?? "Unable to export",
          response.status,
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sales-performance-${month}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFailure({ key, message: message(error) });
      onError(error);
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <h2>Real estate sales</h2>
          <span className="muted">
            Meetings, property viewings and signed sale / lease contracts
          </span>
        </div>
      </div>
      <p>
        Only verified activities count toward targets. Contract value is not
        commission or company revenue; currencies remain separate.
      </p>
      <div className="report-controls">
        <Field label="Month">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            required
          />
        </Field>
        {(employeeId || result?.access.canReview) && (
          <Field label="View">
            <select
              aria-label="View"
              value={own ? "own" : "team"}
              onChange={(event) => {
                setOwn(event.target.value === "own");
                setDepartment("");
                setPerson("");
              }}
            >
              {result?.access.canReview && (
                <option value="team">Team performance</option>
              )}
              {employeeId && <option value="own">My activities</option>}
            </select>
          </Field>
        )}
        {!own && current && (
          <>
            <Field label="Department">
              <select
                aria-label="Department"
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value);
                  setPerson("");
                }}
              >
                <option value="">All accessible departments</option>
                {[...new Set(current.performance.map((row) => row.department))]
                  .sort()
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </Field>
            <Field label="Employee">
              <select
                aria-label="Employee"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
              >
                <option value="">All employees</option>
                {current.performance
                  .filter((row) => !department || row.department === department)
                  .map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>
                      {row.employeeName} ({row.employeeNumber})
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={16} />
          Refresh
        </button>
        {own && current?.access.canSubmit && (
          <button className="button primary" onClick={() => setActivity("new")}>
            <Plus size={16} />
            Register activity
          </button>
        )}
        {!own && current && (
          <button
            className="button secondary"
            disabled={exporting || !performance.length}
            onClick={exportCsv}
          >
            <Download size={16} />
            {exporting ? "Exporting..." : "Export performance CSV"}
          </button>
        )}
      </div>
      {!validMonth ? (
        <p className="error" role="alert">
          Choose a valid month.
        </p>
      ) : failure?.key === key ? (
        <p className="error" role="alert">
          {failure.message} Use Refresh to retry.
        </p>
      ) : !current ? (
        <p role="status">Loading sales activities...</p>
      ) : (
        <>
          {own && !current.access.canSubmit && (
            <p>
              Sales submission is not enabled for your account. HR can enable it
              in your employee profile. Existing history remains available.
            </p>
          )}
          <h3>Monthly performance</h3>
          <div className="table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Meetings / viewings</th>
                  <th>Signed sales / leases</th>
                  <th>Contract values</th>
                  <th>Verification</th>
                  <th>Targets</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => (
                  <tr key={row.employeeId}>
                    <td>
                      {row.employeeName}
                      <br />
                      <small>
                        {row.employeeNumber} / {row.department}
                      </small>
                    </td>
                    <td>
                      {progress(
                        row.meetingTotal,
                        row.target?.meetings,
                        row.achievement.meetings,
                      )}
                      <br />
                      <small>
                        {row.meetings} meetings / {row.viewings} viewings
                      </small>
                    </td>
                    <td>
                      {progress(
                        row.deals,
                        row.target?.deals,
                        row.achievement.deals,
                      )}
                      <br />
                      <small>
                        {row.sales} sales / {row.leases} leases
                      </small>
                    </td>
                    <td>
                      {Object.entries(row.transactionValues).map(
                        ([currency, value]) => (
                          <div key={currency}>{money(value, currency)}</div>
                        ),
                      )}
                      {!Object.keys(row.transactionValues).length &&
                        "No verified value"}
                      {row.target?.transactionValue != null && (
                        <small>
                          Target:{" "}
                          {money(
                            row.target.transactionValue,
                            row.target.currency!,
                          )}{" "}
                          ({row.achievement.transactionValue ?? 0}%)
                        </small>
                      )}
                    </td>
                    <td>
                      {row.pending} pending / {row.returned} returned
                    </td>
                    <td>
                      {current.access.canSetTargets &&
                        row.active &&
                        row.salesEnabled && (
                          <button
                            className="button secondary"
                            onClick={() => setTarget(row)}
                          >
                            Set targets
                          </button>
                        )}
                      {row.target && (
                        <small>
                          Updated by {row.target.updatedBy}
                          <br />
                          {row.target.reason}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!performance.length && (
            <p className="empty">
              No sales employees or activities for this month. HR can enable
              sales access in Employees.
            </p>
          )}
          <div className="report-controls">
            <h3>Activity history</h3>
            <Field label="Activity type">
              <select
                aria-label="Activity type"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="">All types</option>
                {Object.entries(names).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Verification status">
              <select
                aria-label="Verification status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                {["pending", "verified", "returned"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Date / employee</th>
                  <th>Activity / client</th>
                  <th>Property / details</th>
                  <th>Status / review</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {dateLabel(row.activityDate)}
                      <br />
                      <small>
                        {row.employeeName}
                        <br />
                        Submitted:{" "}
                        {new Intl.DateTimeFormat("en", {
                          timeZone: timezone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(row.submittedAt))}
                      </small>
                    </td>
                    <td>
                      {names[row.kind]}
                      <br />
                      {row.clientName}
                    </td>
                    <td>
                      {row.projectName || "—"} / {row.propertyReference || "—"}
                      {row.kind === "closed-deal" ? (
                        <p>
                          {row.transactionType} / {row.dealReference}
                          <br />
                          {money(row.value, row.currency)}
                        </p>
                      ) : (
                        <p>
                          {row.purpose}
                          <br />
                          Outcome: {row.outcome}
                          {row.followUpDate && (
                            <>
                              <br />
                              Follow-up: {dateLabel(row.followUpDate)}
                            </>
                          )}
                        </p>
                      )}
                      {row.notes && (
                        <p className="request-reason">{row.notes}</p>
                      )}
                    </td>
                    <td>
                      <strong>{row.status}</strong>
                      {row.review && (
                        <p>
                          {row.review.status === "returned" &&
                          row.status === "pending"
                            ? "Previous return: "
                            : ""}
                          {row.review.reason}
                          <br />
                          <small>
                            {row.review.by} /{" "}
                            {new Intl.DateTimeFormat("en", {
                              timeZone: timezone,
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(row.review.at))}
                          </small>
                        </p>
                      )}
                    </td>
                    <td>
                      {own &&
                        row.employeeId === employeeId &&
                        current.access.canSubmit &&
                        row.status !== "verified" && (
                          <button
                            className="button secondary"
                            onClick={() => setActivity(row)}
                          >
                            Correct / resubmit
                          </button>
                        )}
                      {row.canReview && row.status === "pending" && (
                        <button
                          className="button primary"
                          onClick={() =>
                            setReview({ record: row, status: "verified" })
                          }
                        >
                          Verify
                        </button>
                      )}
                      {row.canReview && row.status !== "returned" && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            setReview({ record: row, status: "returned" })
                          }
                        >
                          Return for correction
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!activities.length && (
            <p className="empty">No activities match these filters.</p>
          )}
        </>
      )}
      {activity && (
        <ActivityForm
          record={activity === "new" ? null : activity}
          today={today}
          saved={refresh}
          close={() => setActivity(null)}
          onError={onError}
        />
      )}
      {target && (
        <TargetForm
          row={target}
          saved={refresh}
          close={() => setTarget(null)}
          onError={onError}
        />
      )}
      {review && (
        <ReviewForm
          {...review}
          saved={refresh}
          close={() => setReview(null)}
          onError={onError}
        />
      )}
    </section>
  );
}
