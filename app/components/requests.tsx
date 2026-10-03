"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Check, ClipboardList, X } from "lucide-react";
import {
  api,
  send,
  dateLabel,
  time,
  type EmployeeRequest,
} from "../../lib/api";
import { Badge, Field, Modal } from "./modal";

const names = {
  leave: "Leave",
  holiday: "Personal holiday",
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

export function Requests({
  employeeId,
  timezone,
  revision,
  changed,
  onError,
}: {
  employeeId: string | null;
  timezone: string;
  revision: number;
  changed: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [rows, setRows] = useState<EmployeeRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState<EmployeeRequest | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    api<EmployeeRequest[]>("/requests")
      .then((items) => {
        if (alive) setRows(items);
      })
      .catch((error) => {
        if (alive) onError(error);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [revision, version, onError]);
  const filtered = rows.filter((r) => !status || r.status === status);
  return (
    <section className="section">
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
            <option value="">All requests</option>
          </select>
        </Field>
        <span>{filtered.length} requests</span>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.employeeName}</strong>
                  <div>{r.employeeCode}</div>
                </td>
                <td>{names[r.type]}</td>
                <td>{dates(r, timezone)}</td>
                <td>{stamp(r.submittedAt, timezone)}</td>
                <td>
                  <Badge value={r.status} />
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
          <strong>{loaded ? "No requests" : "Loading requests"}</strong>
        </div>
      )}
      {review && (
        <RequestReview
          request={review}
          timezone={timezone}
          canDecide={review.employeeId !== employeeId}
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
  close,
  saved,
}: {
  request: EmployeeRequest;
  timezone: string;
  canDecide: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement;
    setBusy(true);
    setError("");
    try {
      await send(`/requests/${request.id}/decision`, "PATCH", {
        status: button.value,
        reason: form.get("reason"),
      });
      close();
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save decision");
    } finally {
      setBusy(false);
    }
  }
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
              {request.employeeName} ({request.employeeCode})
            </span>
          </Field>
          <Field label="Status">
            <Badge value={request.status} />
          </Field>
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
          <Field label="Employee reason">
            <span className="request-reason">{request.reason}</span>
          </Field>
          {request.status === "pending" && canDecide ? (
            <Field label="Decision reason">
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
          {request.status === "pending" && canDecide && (
            <>
              <button
                type="submit"
                value="rejected"
                className="button secondary"
                disabled={busy}
              >
                <X size={17} />
                Reject
              </button>
              <button
                type="submit"
                value="approved"
                className="button primary"
                disabled={busy}
              >
                <Check size={17} />
                Approve
              </button>
            </>
          )}
        </footer>
      </form>
    </Modal>
  );
}
