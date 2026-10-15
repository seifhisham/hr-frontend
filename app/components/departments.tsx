"use client";
import { useState, type FormEvent } from "react";
import { Plus, Building2 } from "lucide-react";
import { save, type Employee } from "../../lib/api";
import { notifySave } from "../../lib/save-toast";
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
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const name = String(new FormData(form).get("name")).trim();
      if (!name) throw new Error("Enter a department name.");
      await save("/departments", "POST", { name });
      form.reset();
      notifySave({ tone: "success", message: `Department ${name} created. Assign employees from the Employees section.` });
      await saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create department");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section">
      <div className="department-create-panel">
        <div className="department-create-heading">
          <span className="department-create-icon"><Building2 size={20} aria-hidden="true" /></span>
          <div>
            <h2>Create a department</h2>
            <p>Organize your team, then assign employees and direct managers in Employees.</p>
          </div>
        </div>
      <form onSubmit={create} className="department-create-form">
        <Field label="Department name">
          <input name="name" placeholder="e.g. Sales or Engineering" required maxLength={120} disabled={busy} />
        </Field>
        <button className="button primary" disabled={busy}>
          <Plus size={16} aria-hidden="true" />
          {busy ? "Creating..." : "Create department"}
        </button>
      </form>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="department-list-heading">
        <h2>Departments</h2>
        <span>{departments.length} total</span>
      </div>
      <div className="table-wrap department-table">
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
                <td><strong>{name}</strong></td>
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
