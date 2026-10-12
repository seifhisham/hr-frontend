"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  api,
  send,
  type PayrollRow,
  type PayrollRun,
} from "../../lib/api";
import { Badge, Field, Modal } from "./modal";

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
  today,
  revision,
  onError,
}: {
  today: string;
  revision: number;
  onError: (error: unknown) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [approving, setApproving] = useState<PayrollRun | null>(null);
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
  const failed =
    !rows &&
    failure?.month === month &&
    failure.revision === revision &&
    failure.version === version;
  return (
    <section className="section">
      <div className="request-filters">
        <Field label="Payroll month">
          <input
            type="month"
            value={month}
            min="1000-01"
            max="9999-12"
            required
            onChange={(event) => {
              setMonth(event.target.value);
              setEditing(null);
              setApproving(null);
            }}
          />
        </Field>
        {run && (
          <Badge value={run.status === "approved" ? "approved" : "draft"} />
        )}
        {run?.status === "draft" && (
          <button
            className="button primary"
            disabled={
              !rows?.length ||
              rows.some((row) => row.grossSalary === null) ||
              month > today.slice(0, 7)
            }
            onClick={() => setApproving(run)}
          >
            Approve and lock month
          </button>
        )}
      </div>
      {run?.status === "approved" && (
        <p className="message notice">
          Locked payroll approved by {run.approvedBy} on{" "}
          {new Intl.DateTimeFormat("en", {
            timeZone: run.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(run.approvedAt!))}
          . Reason: {run.approvalReason}. These saved salaries and deductions
          will not change when employee records are edited.
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
            {rows?.map((row) => (
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
                        <p key={item.requestId}>
                          {item.status}: {item.days}{" "}
                          {item.days === 1 ? "day" : "days"}
                          <br />
                          Request {item.requestId}
                        </p>
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
      {approving && (
        <ApprovalEditor
          run={approving}
          close={() => setApproving(null)}
          refresh={() => setVersion((value) => value + 1)}
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
      await send("/payroll/approve", "POST", {
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
      await send("/payroll/deductions", "POST", {
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
