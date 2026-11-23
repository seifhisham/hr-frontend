"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import {
  api,
  save,
  type AutomaticDeduction,
  type NeverCheckedIn,
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
  if (item.source !== "request") return item.detail;
  const [type, status] = item.detail.split(" ");
  return `${requestTypes[type] ?? "Request"} request ${status ?? ""}`.trim();
};
const reasonKey = (item: AutomaticDeduction) =>
  item.source === "request" ? item.detail.split(" ")[0] : item.source;
const reasonLabel = (key: string) =>
  key === "late"
    ? "Late arrival"
    : key === "absence"
      ? "Absence"
      : (requestTypes[key] ?? "Other request");
const changeState = (item: AutomaticDeduction) =>
  !item.adjustment ? "unchanged" : item.days === 0 ? "removed" : "edited";
const matchesSearch = (item: AutomaticDeduction, search: string) => {
  const text =
    `${item.employeeName} ${item.employeeNumber} ${item.department}`.toLocaleLowerCase();
  return search
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => text.includes(term));
};
// Keep the current choice listed when a new month has no rows for it.
const optionsFrom = (values: string[], selected: string) =>
  [...new Set(selected ? [...values, selected] : values)].sort((a, b) =>
    a.localeCompare(b),
  );

const dateOnly = (value: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const adjustmentPath = (item: AutomaticDeduction) =>
  item.source === "absence"
    ? `/payroll/absence-deductions/${item.employeeId}/${item.workDate}`
    : `/payroll/automatic-deductions/${item.source}/${item.id}`;

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
  const [never, setNever] = useState<{
    key: string;
    rows: NeverCheckedIn[];
  } | null>(null);
  const [editing, setEditing] = useState<{
    item: AutomaticDeduction;
    remove: boolean;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [reason, setReason] = useState("");
  const [change, setChange] = useState("");
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
  useEffect(() => {
    if (!month) return;
    let alive = true;
    api<NeverCheckedIn[]>(
      `/payroll/never-checked-in?month=${encodeURIComponent(month)}`,
    )
      .then((rows) => {
        if (alive) setNever({ key, rows });
      })
      .catch((error) => {
        if (alive) {
          setNever({ key, rows: [] });
          onError(error);
        }
      });
    return () => {
      alive = false;
    };
  }, [month, key, onError]);
  const rows = items?.key === key ? items.rows : null;
  const neverRows = never?.key === key ? never.rows : null;
  const locked = rows?.some((row) => row.locked) ?? false;
  const filtered = (rows ?? []).filter(
    (item) =>
      (!department || item.department === department) &&
      (!reason || reasonKey(item) === reason) &&
      (!change || changeState(item) === change) &&
      matchesSearch(item, search),
  );
  const visible = pageSlice(filtered, page, pageSize);
  const departments = optionsFrom(
    (rows ?? []).map((item) => item.department),
    department,
  );
  const reasons = optionsFrom((rows ?? []).map(reasonKey), reason);
  const filtering = Boolean(search.trim() || department || reason || change);
  const clearFilters = () => {
    setSearch("");
    setDepartment("");
    setReason("");
    setChange("");
    setPage(1);
  };
  const dateText = (value: string | null, source: AutomaticDeduction["source"]) =>
    !value
      ? "--"
      : source !== "request"
        ? dateOnly(value)
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
        <div className="deduction-filters">
          <div className="field deduction-search-field">
            <span>Search</span>
            <label className="search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search deductions by employee name, ID, or department"
                placeholder="Name, employee ID, or department"
                maxLength={100}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
          <Field label="Department">
            <select
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <select
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All reasons</option>
              {reasons.map((value) => (
                <option key={value} value={value}>
                  {reasonLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Change status">
            <select
              value={change}
              onChange={(event) => {
                setChange(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="unchanged">Not changed</option>
              <option value="edited">Edited</option>
              <option value="removed">Removed</option>
            </select>
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={!filtering}
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
        <p className="deduction-filter-count" role="status">
          {rows === null
            ? "Loading deductions..."
            : filtering
              ? `${filtered.length} of ${rows.length} ${rows.length === 1 ? "deduction" : "deductions"} match`
              : `${rows.length} ${rows.length === 1 ? "deduction" : "deductions"}`}
        </p>
      </div>
      <p className="muted">
        Deductions the system applied from request decisions, late arrivals and
        absences, using the Deduction rules. Edit the days or remove a deduction with a
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
            {rows && rows.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No deductions match your search and filters.
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
                <td>
                  {describe(item)}
                  {item.absenceStatus && item.absenceStatus !== "absent" && (
                    <div>
                      <Badge
                        value={
                          item.absenceStatus === "held"
                            ? "held for review"
                            : "covered"
                        }
                      />
                    </div>
                  )}
                </td>
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
                      disabled={item.locked || item.editable === false}
                      onClick={() => setEditing({ item, remove: false })}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove deduction"
                      aria-label={`Remove deduction for ${item.employeeName}`}
                      disabled={
                        item.locked || item.editable === false || item.days === 0
                      }
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
      <section className="never-checked-in" aria-labelledby="never-checked-in">
        <h3 id="never-checked-in">Never checked in</h3>
        <p className="muted">
          These employees have no attendance in any month, so no absence is
          charged automatically and payroll is not affected. Follow up with
          them, or add a manual deduction on the Payroll page if one is due.
        </p>
        {neverRows === null ? (
          <p className="muted">Loading employees...</p>
        ) : neverRows.length === 0 ? (
          <p className="muted">
            Every employee on {monthLabel(month)} payroll has checked in at
            least once.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Start date</th>
                </tr>
              </thead>
              <tbody>
                {neverRows.map((person) => (
                  <tr key={person.employeeId}>
                    <td>
                      <strong>{person.employeeName}</strong>
                      <div className="muted">
                        {person.employeeNumber} / {person.department}
                      </div>
                    </td>
                    <td>{person.branchName ?? "--"}</td>
                    <td>{dateOnly(person.startDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
      await save(adjustmentPath(item), "PATCH", {
        days: remove ? 0 : Number(form.get("days")),
        reason: form.get("reason"),
      });
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
