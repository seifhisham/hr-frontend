"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  api,
  save,
  type AutomaticDeduction,
} from "../../lib/api";
import { Badge, Field, Modal } from "./modal";
import { PAGE_SIZES, Pager, pageSlice } from "./pager";

const daysLabel = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
const monthLabel = (month: string) =>
  /^\d{4}-\d{2}$/.test(month)
    ? new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }).format(new Date(`${month}-01T00:00:00Z`))
    : month;
const requestTypes: Record<string, string> = {
  leave: "Leave",
  holiday: "Holiday",
  sick: "Sick",
  unpaid: "Unpaid",
  urgent: "Urgent",
  mission: "Mission",
  excuse: "Excuse",
  "forgotten-check-out": "Forgotten check-out",
};
// The API sends "<type> <status>" for requests; show it in plain words.
const describe = (item: AutomaticDeduction) => {
  if (item.source === "late") return item.detail;
  const [type, status] = item.detail.split(" ");
  return `${requestTypes[type] ?? "Request"} request ${status ?? ""}`.trim();
};

export function AutomaticDeductions({
  today,
  timezone,
  revision,
  onError,
}: {
  today: string;
  timezone: string;
  revision: number;
  onError: (error: unknown) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<{
    key: string;
    rows: AutomaticDeduction[];
  } | null>(null);
  const [editing, setEditing] = useState<{
    item: AutomaticDeduction;
    remove: boolean;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const key = `${month}:${revision}:${version}`;
  useEffect(() => {
    if (!month) return;
    let alive = true;
    api<AutomaticDeduction[]>(
      `/payroll/automatic-deductions?month=${encodeURIComponent(month)}`,
    )
      .then((rows) => {
        if (alive) setItems({ key, rows });
      })
      .catch((error) => {
        if (alive) {
          setItems({ key, rows: [] });
          onError(error);
        }
      });
    return () => {
      alive = false;
    };
  }, [month, key, onError]);
  const rows = items?.key === key ? items.rows : null;
  const locked = rows?.some((row) => row.locked) ?? false;
  const visible = pageSlice(rows ?? [], page, pageSize);
  const dateText = (value: string | null, source: AutomaticDeduction["source"]) =>
    !value
      ? "--"
      : source === "late"
        ? new Intl.DateTimeFormat("en", {
            timeZone: "UTC",
            dateStyle: "medium",
          }).format(new Date(`${value}T00:00:00Z`))
        : new Intl.DateTimeFormat("en", {
            timeZone: timezone,
            dateStyle: "medium",
          }).format(new Date(value));
  return (
    <section className="section automatic-deductions">
      <div className="payroll-toolbar">
        <div className="payroll-toolbar-row">
          <div className="payroll-period">
            <Field label="Payroll month">
              <input
                type="month"
                value={month}
                required
                onChange={(event) => {
                  setMonth(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
        </div>
      </div>
      <p className="muted">
        Deductions the system applied from request decisions and late arrivals,
        using the Deduction rules. Edit the days or remove a deduction with a
        reason; every change is recorded in the Activity log and payroll
        updates immediately. Approved payroll months are locked.
      </p>
      {locked && (
        <p className="message notice">
          Payroll for {monthLabel(month)} is approved and locked. These deductions can no
          longer be changed.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Reason for deduction</th>
              <th>Date</th>
              <th>Automatic</th>
              <th>Applied</th>
              <th>Change history</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={7} className="muted">
                  Loading automatic deductions...
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No automatic deductions for {monthLabel(month)}.
                </td>
              </tr>
            )}
            {rows && visible.rows.map((item) => (
              <tr key={`${item.source}:${item.id}`}>
                <td>
                  <strong>{item.employeeName}</strong>
                  <div className="muted">
                    {item.employeeNumber} / {item.department}
                  </div>
                </td>
                <td>{describe(item)}</td>
                <td>{dateText(item.date, item.source)}</td>
                <td>{daysLabel(item.automaticDays)}</td>
                <td>
                  <strong>{daysLabel(item.days)}</strong>
                  {item.adjustment && (
                    <div>
                      <Badge value={item.days === 0 ? "removed" : "edited"} />
                    </div>
                  )}
                </td>
                <td>
                  {item.adjustment ? (
                    <span className="muted">
                      {item.adjustment.by},{" "}
                      {new Intl.DateTimeFormat("en", {
                        timeZone: timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.adjustment.at))}
                      <br />
                      Reason: {item.adjustment.reason}
                    </span>
                  ) : (
                    <span className="muted">Not changed</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit deduction"
                      aria-label={`Edit deduction for ${item.employeeName}`}
                      disabled={item.locked}
                      onClick={() => setEditing({ item, remove: false })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove deduction"
                      aria-label={`Remove deduction for ${item.employeeName}`}
                      disabled={item.locked || item.days === 0}
                      onClick={() => setEditing({ item, remove: true })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        label="Automatic deduction pages"
        noun={["deduction", "deductions"]}
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
      {editing && (
        <AdjustmentEditor
          item={editing.item}
          remove={editing.remove}
          close={() => setEditing(null)}
          saved={() => setVersion((value) => value + 1)}
        />
      )}
    </section>
  );
}

function AdjustmentEditor({
  item,
  remove,
  close,
  saved,
}: {
  item: AutomaticDeduction;
  remove: boolean;
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
      await save(
        `/payroll/automatic-deductions/${item.source}/${item.id}`,
        "PATCH",
        {
          days: remove ? 0 : Number(form.get("days")),
          reason: form.get("reason"),
        },
      );
      saved();
      close();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to update the deduction",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={remove ? "Remove deduction" : "Edit deduction"}
      className="automatic-deduction-modal"
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Employee">
            <span>
              {item.employeeName} / {item.employeeNumber}
            </span>
          </Field>
          <Field label="Reason for deduction">
            <span>{describe(item)}</span>
          </Field>
          <Field label="Automatic / currently applied">
            <span>
              {daysLabel(item.automaticDays)} / {daysLabel(item.days)}
            </span>
          </Field>
          {!remove && (
            <Field label="Salary days to deduct">
              <input
                name="days"
                type="number"
                min={0}
                max={30}
                step={0.25}
                required
                autoFocus
                defaultValue={item.days}
                disabled={busy}
              />
            </Field>
          )}
          <Field label="Reason for this change">
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              autoFocus={remove}
              disabled={busy}
              placeholder="For example: medical certificate provided"
            />
          </Field>
        </div>
        <p className="muted">
          {remove
            ? "The employee will not be charged for this item."
            : "Use steps of 0.25 day. Enter 0 to remove it."}{" "}
          The change and your reason are recorded in the Activity log.
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
          <button
            className={`button ${remove ? "danger" : "primary"}`}
            disabled={busy}
          >
            {busy ? "Saving..." : remove ? "Remove deduction" : "Save change"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
