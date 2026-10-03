"use client";
import { useState, type FormEvent } from "react";
import { Check, Save } from "lucide-react";
import {
  api,
  send,
  time,
  type Audit,
  type Attendance,
  type Employee,
  type Role,
  type Schedule,
} from "../../lib/api";
import { Field, Modal } from "./modal";
import { PasswordField } from "./password-field";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save changes";
export function EmployeeEditor({
  employee,
  schedules,
  role,
  today,
  close,
  saved,
}: {
  employee: Employee | null;
  schedules: Schedule[];
  role: Role;
  today: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const value = {
      employeeCode: form.get("employeeCode"),
      name: form.get("name"),
      email: form.get("email"),
      department: form.get("department"),
      jobTitle: form.get("jobTitle"),
      startDate: form.get("startDate"),
      scheduleId: form.get("scheduleId"),
      role: form.get("role") ?? employee?.role ?? "employee",
      active: form.get("active") === "on",
      ...(form.get("password") ? { password: form.get("password") } : {}),
    };
    try {
      await send(
        employee ? `/employees/${employee.id}` : "/employees",
        employee ? "PATCH" : "POST",
        value,
      );
      await saved();
      close();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={employee ? "Edit employee" : "Add employee"} close={close}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Full name">
            <input
              name="name"
              defaultValue={employee?.name}
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Employee code">
            <input
              name="employeeCode"
              defaultValue={employee?.employeeCode}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={employee?.email}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Job title">
            <input
              name="jobTitle"
              defaultValue={employee?.jobTitle}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Department">
            <input
              name="department"
              defaultValue={employee?.department}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Employment start date">
            <input
              name="startDate"
              type="date"
              defaultValue={employee?.startDate ?? today}
              required
            />
          </Field>
          <Field label="Work schedule">
            <select
              name="scheduleId"
              defaultValue={employee?.scheduleId ?? schedules[0]?.id}
              required
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {role === "admin" && (
            <Field label="Access role">
              <select name="role" defaultValue={employee?.role ?? "employee"}>
                <option value="employee">Employee</option>
                <option value="hr">HR staff</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
          )}
          <PasswordField
            label={employee ? "New password (optional)" : "Initial password"}
            name="password"
            required={!employee}
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <label className="check-label">
            <input
              type="checkbox"
              name="active"
              defaultChecked={employee?.active ?? true}
            />
            Active employee
          </label>
        </div>
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
            <Save size={16} />
            {busy ? "Saving..." : "Save employee"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function ScheduleEditor({
  schedule,
  close,
  saved,
}: {
  schedule: Schedule | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [selectedDays, setSelectedDays] = useState(
    schedule?.days ?? [0, 1, 2, 3, 4],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await send(
        schedule ? `/schedules/${schedule.id}` : "/schedules",
        schedule ? "PATCH" : "POST",
        {
          name: data.get("name"),
          start: data.get("start"),
          end: data.get("end"),
          days: selectedDays,
          graceMinutes: Number(data.get("graceMinutes")),
        },
      );
      await saved();
      close();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={schedule ? "Edit work schedule" : "New work schedule"}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Schedule name">
            <input
              name="name"
              defaultValue={schedule?.name}
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Grace period (minutes)">
            <input
              name="graceMinutes"
              type="number"
              defaultValue={schedule?.graceMinutes ?? 15}
              required
              min={0}
              max={120}
            />
          </Field>
          <Field label="Start time">
            <input
              name="start"
              type="time"
              defaultValue={schedule?.start ?? "10:00"}
              required
            />
          </Field>
          <Field label="End time">
            <input
              name="end"
              type="time"
              defaultValue={schedule?.end ?? "18:00"}
              required
            />
          </Field>
          <fieldset className="day-field">
            <legend>Working days</legend>
            <div className="day-options">
              {days.map((day, i) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(i)}
                    onChange={(e) =>
                      setSelectedDays(
                        e.target.checked
                          ? [...selectedDays, i]
                          : selectedDays.filter((v) => v !== i),
                      )
                    }
                  />
                  <span>{day}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
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
            <Save size={16} />
            {busy ? "Saving..." : "Save schedule"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function CorrectionEditor({
  record,
  close,
  saved,
}: {
  record: Attendance;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Audit[] | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await send(
        record.id ? `/attendance/${record.id}` : "/attendance",
        record.id ? "PATCH" : "POST",
        {
          ...(!record.id
            ? { employeeId: record.employeeId, workDate: record.workDate }
            : {}),
          checkIn: new Date(String(data.get("checkIn"))).toISOString(),
          checkOut: data.get("checkOut")
            ? new Date(String(data.get("checkOut"))).toISOString()
            : null,
          reason: data.get("reason"),
        },
      );
      await saved();
      close();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record.id ? "Attendance details" : "Record attendance"}
      close={close}
    >
      <div className="record-summary">
        <strong>{record.name}</strong>
        <span>
          {record.employeeCode} / {record.workDate}
        </span>
        <span>
          {time(record.checkIn, record.timezone)} -{" "}
          {time(record.checkOut, record.timezone)} ({record.timezone})
        </span>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label={`Check-in (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          >
            <input
              type="datetime-local"
              name="checkIn"
              required
              defaultValue={
                localInput(record.checkIn) || `${record.workDate}T10:00`
              }
            />
          </Field>
          <Field
            label={`Check-out (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          >
            <input
              type="datetime-local"
              name="checkOut"
              defaultValue={localInput(record.checkOut)}
            />
          </Field>
          <label className="field full">
            <span>
              {record.id ? "Reason for correction" : "Reason for manual entry"}
            </span>
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={3}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          {record.id && (
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  setHistory(
                    await api<Audit[]>(`/audit?recordId=${record.id}`),
                  );
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Correction history
            </button>
          )}
          <button className="button primary" disabled={busy}>
            <Check size={16} />
            {busy
              ? "Saving..."
              : record.id
                ? "Save correction"
                : "Record attendance"}
          </button>
        </footer>
      </form>
      {history && (
        <div className="correction-history">
          {history.length === 0 ? (
            <p className="muted">No corrections recorded.</p>
          ) : (
            history.map((h) => (
              <article key={h.id}>
                <strong>{h.actor}</strong>
                <span>{new Date(h.at).toLocaleString()}</span>
                <p>{h.reason}</p>
                <div className="muted">
                  Check-in:{" "}
                  {time(
                    typeof h.before?.checkIn === "string"
                      ? h.before.checkIn
                      : null,
                    record.timezone,
                  )}{" "}
                  to{" "}
                  {time(
                    typeof h.after?.checkIn === "string"
                      ? h.after.checkIn
                      : null,
                    record.timezone,
                  )}
                  <br />
                  Check-out:{" "}
                  {time(
                    typeof h.before?.checkOut === "string"
                      ? h.before.checkOut
                      : null,
                    record.timezone,
                  )}{" "}
                  to{" "}
                  {time(
                    typeof h.after?.checkOut === "string"
                      ? h.after.checkOut
                      : null,
                    record.timezone,
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}
