"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Check, X } from "lucide-react";
import {
  api,
  send,
  dateLabel,
  time,
  type EmployeeRequest,
  type Schedule,
} from "../../lib/api";
import { Badge, Field, Modal } from "./modal";

const names = {
  leave: "Normal vacation",
  holiday: "Personal holiday",
  sick: "Sick",
  unpaid: "Unpaid",
  urgent: "Urgent",
  excuse: "Excuse",
  mission: "Mission",
  "forgotten-check-out": "Forgotten check-out",
};
const stamp = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const dates = (r: EmployeeRequest, timezone: string) =>
  r.proposedCheckOut
    ? stamp(r.proposedCheckOut, r.attendance?.timezone ?? timezone)
    : `${dateLabel(r.from!)} - ${dateLabel(r.to!)}`;
const deduction = (r: EmployeeRequest) =>
  r.salaryDeductionDays != null
    ? `${r.salaryDeductionDays} salary ${r.salaryDeductionDays === 1 ? "day" : "days"}`
    : r.type === "forgotten-check-out"
      ? "Not applicable"
      : r.status === "pending"
        ? "Awaiting decision"
        : "Not recorded";

function RequestForm({ today, saved }: { today: string; saved: () => void }) {
  const [type, setType] = useState("leave");
  const [shift, setShift] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ employee: { scheduleId: string } }>("/auth/me"),
      api<Schedule[]>("/schedules"),
    ])
      .then(([session, rows]) => {
        if (alive)
          setShift(
            rows.find((s) => s.id === session.employee.scheduleId) ?? null,
          );
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Unable to load shift");
      });
    return () => {
      alive = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const files = form
        .getAll("attachments")
        .filter((f): f is File => f instanceof File && f.size > 0);
      if (
        files.length > 3 ||
        files.some(
          (f) =>
            f.size > 512 * 1024 ||
            !["application/pdf", "image/png", "image/jpeg"].includes(f.type),
        )
      )
        throw new Error(
          "Attach up to 3 PDF, PNG, or JPEG files, each at most 512 KB.",
        );
      const attachments = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          mimeType: file.type,
          content: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () =>
              reject(new Error("Unable to read attachment"));
            reader.readAsDataURL(file);
          }),
        })),
      );
      await send("/requests", "POST", {
        type,
        from: form.get("from"),
        to: form.get("to"),
        reason: form.get("reason"),
        attachments,
        ...(type === "excuse"
          ? {
              durationMinutes: Number(form.get("durationMinutes")),
              excuseType: form.get("excuseType"),
              shiftId: shift?.id,
            }
          : {}),
      });
      element.reset();
      setNotice("Request submitted for HR review.");
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit request");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <h2>Add request</h2>
      {
        <p>
          Approval deducts 1 salary day. Rejection deducts 3 salary days. This
          applies once per request.
        </p>
      }
      <fieldset disabled={busy} className="form-grid">
        <Field label="Request type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {["leave", "sick", "unpaid", "urgent", "excuse", "mission"].map(
              (v) => (
                <option key={v} value={v}>
                  {names[v as keyof typeof names]}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="From">
          <input name="from" type="date" defaultValue={today} required />
        </Field>
        <Field label="To">
          <input name="to" type="date" defaultValue={today} required />
        </Field>
        {type === "excuse" && (
          <>
            <p>
              Monthly allowance: 4 hours (240 minutes), across at most 3 Excuse
              requests. Pending and approved requests count; rejected or
              withdrawn requests release the allowance. Duration is counted for
              each date in the range.
            </p>
            <Field label="Duration (minutes)">
              <input
                name="durationMinutes"
                type="number"
                min={1}
                max={240}
                defaultValue={15}
                required
              />
            </Field>
            <Field label="Excuse type">
              <select name="excuseType">
                <option value="leaving-early">Leaving early</option>
                <option value="arriving-late">Arriving late</option>
                <option value="during-shift">During shift</option>
              </select>
            </Field>
            <Field label="Shift">
              <select required disabled={!shift}>
                {shift ? (
                  <option value={shift.id}>
                    {shift.name}: {shift.start} - {shift.end}
                  </option>
                ) : (
                  <option value="">Loading assigned shift...</option>
                )}
              </select>
            </Field>
          </>
        )}
        <Field label="Description">
          <textarea
            name="reason"
            required={type !== "excuse"}
            minLength={type === "excuse" ? undefined : 5}
            maxLength={type === "excuse" ? 120 : 500}
            rows={3}
          />
        </Field>
        <Field label="Attachments (up to 3, 512 KB each)">
          <input
            name="attachments"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            multiple
          />
        </Field>
      </fieldset>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="message notice" role="status">
          {notice}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || (type === "excuse" && !shift)}
      >
        {busy ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}

export function Requests({
  employeeId,
  timezone,
  revision,
  changed,
  onError,
  own = false,
  manager = false,
  today,
}: {
  employeeId: string | null;
  timezone: string;
  revision: number;
  changed: () => Promise<void>;
  onError: (error: unknown) => void;
  own?: boolean;
  manager?: boolean;
  today?: string;
}) {
  const [status, setStatus] = useState("pending");
  const [review, setReview] = useState<EmployeeRequest | null>(null);
  const [version, setVersion] = useState(0);
  const listKey = JSON.stringify([revision, version, own, manager, status]);
  const [pagination, setPagination] = useState<{
    key: string;
    cursors: string[];
  }>({ key: "", cursors: [] });
  const cursors = pagination.key === listKey ? pagination.cursors : [];
  const before = cursors.at(-1);
  const pageKey = JSON.stringify([listKey, before]);
  const [result, setResult] = useState<{
    key: string;
    rows: EmployeeRequest[];
    error?: boolean;
  } | null>(null);
  const loaded = result?.key === pageKey;
  const rows = loaded ? result.rows : [];
  useEffect(() => {
    let alive = true;
    const path = manager
      ? "/requests/managed"
      : own
        ? "/requests/me"
        : "/requests";
    const query = new URLSearchParams({
      limit: "50",
      ...(status ? { status } : {}),
      ...(before ? { before } : {}),
    });
    api<EmployeeRequest[]>(`${path}?${query}`)
      .then((items) => {
        if (alive) setResult({ key: pageKey, rows: items });
      })
      .catch((e) => {
        if (alive) {
          setResult({ key: pageKey, rows: [], error: true });
          onError(e);
        }
      });
    return () => {
      alive = false;
    };
  }, [pageKey, before, status, onError, own, manager]);
  const filtered = rows;
  return (
    <section className="section">
      {own && (
        <RequestForm today={today!} saved={() => setVersion((v) => v + 1)} />
      )}
      {own && (
        <p>
          Salary deductions on this page:{" "}
          {rows.reduce((total, r) => total + (r.salaryDeductionDays ?? 0), 0)}{" "}
          days
        </p>
      )}
      <div className="request-filters">
        <Field label="Status">
          <select
            aria-label="Request status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="">All requests</option>
          </select>
        </Field>
        <span>{filtered.length} requests on this page</span>
        <button type="button" onClick={() => setVersion((v) => v + 1)}>
          Refresh
        </button>
        <button
          type="button"
          disabled={!cursors.length}
          onClick={() =>
            setPagination({ key: listKey, cursors: cursors.slice(0, -1) })
          }
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!loaded || rows.length < 50}
          onClick={() =>
            setPagination({
              key: listKey,
              cursors: [...cursors, rows[rows.length - 1].id],
            })
          }
        >
          Next
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Request</th>
              <th>Dates / proposed departure</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Salary deduction</th>
              <th>Manager review</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.employeeName}</strong>
                  <div>{r.nationalId}</div>
                </td>
                <td>{names[r.type]}</td>
                <td>{dates(r, timezone)}</td>
                <td>{stamp(r.submittedAt, timezone)}</td>
                <td>
                  <Badge value={r.status} />
                </td>
                <td>{deduction(r)}</td>
                <td>
                  {r.managerStage === "pending"
                    ? "Awaiting manager"
                    : r.managerStage === "approved" ||
                        r.managerStage === "rejected"
                      ? `Manager ${r.managerStage}`
                      : "Not required"}
                </td>
                <td>
                  <button
                    className="icon-button"
                    title="Review request"
                    aria-label={`Review request from ${r.employeeName}`}
                    onClick={() => setReview(r)}
                  >
                    <ClipboardList size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="empty">
          <ClipboardList size={28} />
          <strong>
            {loaded
              ? result.error
                ? "Unable to load requests. Refresh to retry."
                : "No requests"
              : "Loading requests"}
          </strong>
        </div>
      )}
      {review && (
        <RequestReview
          request={review}
          timezone={timezone}
          canWithdraw={!!own && review.status === "pending"}
          canManagerReview={
            manager &&
            review.managerStage === "pending" &&
            review.managerEmployeeId === employeeId
          }
          canDecide={
            !own &&
            !manager &&
            review.employeeId !== employeeId &&
            review.managerStage !== "pending" &&
            (review.managerStage === "not-required" ||
              review.managerReview?.employeeId !== employeeId)
          }
          close={() => setReview(null)}
          saved={async () => {
            setVersion((v) => v + 1);
            await changed();
          }}
        />
      )}
    </section>
  );
}

function RequestReview({
  request,
  timezone,
  canDecide,
  canWithdraw,
  canManagerReview,
  close,
  saved,
}: {
  request: EmployeeRequest;
  timezone: string;
  canDecide: boolean;
  canWithdraw: boolean;
  canManagerReview: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shifts, setShifts] = useState<Schedule[]>([]);
  useEffect(() => {
    let alive = true;
    if (request.type === "excuse")
      api<Schedule[]>("/schedules")
        .then((rows) => {
          if (alive) setShifts(rows);
        })
        .catch((e) => {
          if (alive)
            setError(e instanceof Error ? e.message : "Unable to load shift");
        });
    return () => {
      alive = false;
    };
  }, [request.type]);
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement;
    setBusy(true);
    setError("");
    try {
      const action = button.value;
      await send(
        `/requests/${request.id}/${action === "withdraw" || action === "reopen" ? action : canManagerReview ? "manager-review" : "decision"}`,
        "PATCH",
        {
          ...(action === "withdraw" || action === "reopen"
            ? {}
            : { status: action }),
          reason: form.get("reason"),
        },
      );
      close();
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save decision");
    } finally {
      setBusy(false);
    }
  }
  const canReopen =
    canDecide &&
    request.status === "approved" &&
    request.type !== "forgotten-check-out";
  const canChange = canWithdraw || canReopen;
  const shift = shifts.find((s) => s.id === request.shiftId);
  return (
    <Modal
      title={names[request.type]}
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={decide}>
        <div className="form-grid">
          <Field label="Employee">
            <span>
              {request.employeeName} ({request.nationalId})
            </span>
          </Field>
          <Field label="Status">
            <Badge value={request.status} />
          </Field>
          <Field label="Manager review">
            <span>
              {request.managerStage === "pending"
                ? "Awaiting direct manager"
                : request.managerStage === "approved" ||
                    request.managerStage === "rejected"
                  ? `Manager recommended ${request.managerStage}`
                  : "Not required"}
            </span>
          </Field>
          {request.managerReview && (
            <Field
              label={
                request.managerStage === "pending"
                  ? "Previous recommendation (new review required)"
                  : "Manager recommendation"
              }
            >
              <span>
                {request.managerReview.reviewedBy},{" "}
                {stamp(request.managerReview.reviewedAt, timezone)}:{" "}
                {request.managerReview.reason}
              </span>
            </Field>
          )}
          {canManagerReview && (
            <p>
              This records your recommendation. HR gives the final decision and
              applies any salary deduction.
            </p>
          )}
          <Field label="Salary deduction">
            <span>{deduction(request)}</span>
          </Field>
          {request.type !== "forgotten-check-out" &&
            request.status === "pending" && (
              <p>
                Approval deducts 1 salary day. Rejection deducts 3 salary days.
                This applies once per request, regardless of its length.
              </p>
            )}
          {request.attendance && (
            <>
              <Field label="Workday">
                <span>{dateLabel(request.attendance.workDate)}</span>
              </Field>
              <Field label="Recorded check-in">
                <span>
                  {time(
                    request.attendance.checkIn,
                    request.attendance.timezone,
                  )}{" "}
                  ({request.attendance.timezone})
                </span>
              </Field>
            </>
          )}
          <Field
            label={
              request.proposedCheckOut
                ? "Proposed departure"
                : "Requested dates"
            }
          >
            <span>{dates(request, timezone)}</span>
          </Field>
          {request.type === "excuse" && (
            <>
              <Field label="Duration">
                <span>{request.durationMinutes} minutes</span>
              </Field>
              <Field label="Excuse type">
                <span>{request.excuseType?.replaceAll("-", " ")}</span>
              </Field>
              <Field label="Shift">
                <span>
                  {shift
                    ? `${shift.name}: ${shift.start} - ${shift.end}`
                    : request.shiftId}
                </span>
              </Field>
            </>
          )}
          <Field label="Employee description">
            <span className="request-reason">
              {request.reason || "No description"}
            </span>
          </Field>
          {!!request.attachments?.length && (
            <Field label="Attachments">
              {request.attachments.map((file, i) => (
                <a
                  key={i}
                  download={file.name}
                  href={`data:${file.mimeType};base64,${file.content}`}
                >
                  {file.name}
                </a>
              ))}
            </Field>
          )}
          {request.lastChange && (
            <Field label="Last change">
              <span>
                {request.lastChange.action === "withdraw"
                  ? "Withdrawn"
                  : "Reopened"}{" "}
                by {request.lastChange.by},{" "}
                {stamp(request.lastChange.at, timezone)}:{" "}
                {request.lastChange.reason}
              </span>
            </Field>
          )}
          {canReopen && (
            <p>
              Reopening removes the approval and its salary deduction until a
              new decision. The employee can withdraw and submit a replacement
              if the details need changing.
            </p>
          )}
          {(request.status === "pending" && (canDecide || canManagerReview)) ||
          canChange ? (
            <Field
              label={
                canChange
                  ? "Change reason"
                  : canManagerReview
                    ? "Manager review reason"
                    : "Decision reason"
              }
            >
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={500}
                rows={3}
                autoFocus
                disabled={busy}
              />
            </Field>
          ) : (
            request.decisionReason && (
              <Field label="Decision">
                <span className="request-reason">
                  {request.decisionReason}
                  <br />
                  {request.decidedBy}, {stamp(request.decidedAt!, timezone)}
                </span>
              </Field>
            )
          )}
        </div>
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            Close
          </button>
          {canChange && (
            <button
              type="submit"
              value={canWithdraw ? "withdraw" : "reopen"}
              className="button secondary"
              disabled={busy}
            >
              {canWithdraw ? "Withdraw request" : "Reopen for correction"}
            </button>
          )}
          {request.status === "pending" && (canDecide || canManagerReview) && (
            <>
              <button
                type="submit"
                value="rejected"
                className="button secondary"
                disabled={busy}
              >
                <X size={17} />
                {canManagerReview ? "Recommend rejection" : "Reject"}
              </button>
              <button
                type="submit"
                value="approved"
                className="button primary"
                disabled={busy}
              >
                <Check size={17} />
                {canManagerReview ? "Recommend approval" : "Approve"}
              </button>
            </>
          )}
        </footer>
      </form>
    </Modal>
  );
}
