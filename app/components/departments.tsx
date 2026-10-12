"use client";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { send, type Employee } from "../../lib/api";
import { Field } from "./modal";

export function Departments({
  departments,
  employees,
  saved,
}: {
  departments: string[];
  employees: Employee[];
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const name = String(new FormData(form).get("name")).trim();
      if (!name) throw new Error("Enter a department name.");
      await send("/departments", "POST", { name });
      form.reset();
      setNotice(
        `Department ${name} created. Assign employees from the Employees section.`,
      );
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create department");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <p>
        Create departments now and assign or move employees later by editing
        their Department in the Employees section.
      </p>
      <p>Assign each employee a direct manager in the Employees section.</p>
      <form onSubmit={create} className="report-controls">
        <Field label="Department name">
          <input name="name" required maxLength={120} disabled={busy} />
        </Field>
        <button className="button primary" disabled={busy}>
          <Plus size={16} />
          {busy ? "Creating..." : "Create department"}
        </button>
      </form>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Assigned employees</th>
              <th>Active employees</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((name) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{employees.filter((e) => e.department === name).length}</td>
                <td>
                  {
                    employees.filter((e) => e.department === name && e.active)
                      .length
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!departments.length && (
        <div className="empty">
          <strong>No departments yet</strong>
        </div>
      )}
    </section>
  );
}
