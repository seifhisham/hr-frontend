"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  save,
  type Branch,
  type Employee,
  type Role,
  type Company,
} from "../../lib/api";
import { Field, Modal } from "./modal";
import { CompanyLocation } from "./company-location";

type HrAccount = { id: string; name: string; email: string };
export function Branches({
  branches,
  employees,
  company,
  today,
  role,
  refresh,
  onError,
}: {
  branches: Branch[];
  employees: Employee[];
  company: Company;
  today: string;
  role: Role;
  refresh: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [editor, setEditor] = useState<Branch | "new" | null>(null);
  const [accounts, setAccounts] = useState<HrAccount[]>([]);
  const [selected, setSelected] = useState("");
  const [grants, setGrants] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<
    { branchId: string; name: string; effectiveFrom: string }[]
  >([]);
  const [employeeId, setEmployeeId] = useState("");
  useEffect(() => {
    if (role !== "admin") return;
    let alive = true;
    api<HrAccount[]>("/hr-accounts")
      .then((rows) => {
        if (alive) setAccounts(rows);
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [role, employees, onError]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api<string[]>(`/hr-accounts/${encodeURIComponent(selected)}/branches`)
      .then((rows) => {
        if (alive) setGrants(rows);
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [selected, onError]);
  useEffect(() => {
    if (!employeeId) return;
    let alive = true;
    api<typeof history>(`/employees/${encodeURIComponent(employeeId)}/branches`)
      .then((rows) => {
        if (alive) setHistory(rows);
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [employeeId, branches, onError]);
  async function saveGrants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await save(`/hr-accounts/${selected}/branches`, "PATCH", {
        branchIds: grants,
        reason: data.get("reason"),
      });
      setMessage(
        "HR branch permissions saved. Changes apply to existing sessions.",
      );
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function transfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const rows = await save<typeof history>(
        `/employees/${employeeId}/branches`,
        "POST",
        {
          branchId: data.get("branchId"),
          effectiveFrom: data.get("effectiveFrom"),
          reason: data.get("reason"),
        },
      );
      setHistory(rows);
      setMessage(
        "Branch assignment saved. Earlier records remain with their original branch.",
      );
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="branches-page">
      <div className="section-heading">
        <h2>
          {role === "admin" ? "Company branches" : "Assigned HR branches"}
        </h2>
        {role === "admin" && (
          <button
            type="button"
            className="button primary"
            onClick={() => setEditor("new")}
          >
            Add branch
          </button>
        )}
      </div>
      <p className="muted">
        All branches use {company.timezone}. Attendance uses the employee’s
        assigned branch and the policy saved with each record.
      </p>
      {message && (
        <p role="status" className="message notice">
          {message}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Code</th>
              <th>Address</th>
              <th>Status</th>
              {role === "admin" && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{branch.code}</td>
                <td>{branch.address || "—"}</td>
                <td>{branch.active ? "Active" : "Inactive"}</td>
                {role === "admin" && (
                  <td>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setEditor(branch)}
                    >
                      Edit branch
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === "admin" && (
        <>
          <section className="settings-section">
            <h3>HR branch permissions</h3>
            <p className="muted">
              Select the branches this HR account may administer. An employee’s
              home branch does not grant HR access. No selection means personal
              employee access only.
            </p>
            <Field label="HR account">
              <select
                disabled={busy}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setGrants(null);
                }}
              >
                <option value="">Select an HR account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {account.email}
                  </option>
                ))}
              </select>
            </Field>
            {selected && grants === null && (
              <p role="status">Loading permissions…</p>
            )}
            {selected && grants !== null && (
              <form onSubmit={saveGrants}>
                <fieldset disabled={busy}>
                  <legend>Permitted branches</legend>
                  {branches.map((branch) => (
                    <label className="branch-check" key={branch.id}>
                      <span>
                        <input
                          type="checkbox"
                          checked={grants.includes(branch.id)}
                          onChange={(event) =>
                            setGrants((current) =>
                              event.target.checked
                                ? [...(current ?? []), branch.id]
                                : (current ?? []).filter(
                                    (id) => id !== branch.id,
                                  ),
                            )
                          }
                        />{" "}
                        {branch.name}
                        {!branch.active ? " (inactive; history only)" : ""}
                      </span>
                    </label>
                  ))}
                  <Field label="Reason">
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={500}
                    />
                  </Field>
                  <button className="button primary" disabled={busy}>
                    {busy ? "Saving…" : "Save HR permissions"}
                  </button>
                </fieldset>
              </form>
            )}
          </section>
          <section className="settings-section">
            <h3>Employee branch assignments</h3>
            <p className="muted">
              Close open attendance and resolve requests crossing the transfer
              date first. Transfers cannot be backdated.
            </p>
            <Field label="Employee">
              <select
                disabled={busy}
                value={employeeId}
                onChange={(event) => {
                  setEmployeeId(event.target.value);
                  setHistory([]);
                }}
              >
                <option value="">Select an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employeeNumber})
                  </option>
                ))}
              </select>
            </Field>
            {employeeId && (
              <>
                <ul>
                  {history.map((assignment) => (
                    <li key={assignment.effectiveFrom}>
                      {assignment.effectiveFrom}: {assignment.name}
                    </li>
                  ))}
                </ul>
                <form onSubmit={transfer}>
                  <fieldset disabled={busy}>
                    <legend>New assignment</legend>
                    <Field label="New branch">
                      <select name="branchId" required defaultValue="">
                        <option value="" disabled>
                          Select a branch
                        </option>
                        {branches
                          .filter((branch) => branch.active)
                          .map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Effective work date">
                      <input
                        name="effectiveFrom"
                        type="date"
                        min={today}
                        defaultValue={today}
                        required
                      />
                    </Field>
                    <Field label="Reason">
                      <textarea
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </Field>
                    <button className="button primary" disabled={busy}>
                      {busy ? "Saving…" : "Save branch assignment"}
                    </button>
                  </fieldset>
                </form>
              </>
            )}
          </section>
        </>
      )}
      {editor && (
        <BranchEditor
          branch={editor === "new" ? null : editor}
          company={company}
          close={() => setEditor(null)}
          saved={refresh}
        />
      )}
    </section>
  );
}
function BranchEditor({
  branch,
  company,
  close,
  saved,
}: {
  branch: Branch | null;
  company: Company;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const input = {
      code: form.get("code"),
      name: form.get("name"),
      address: form.get("address"),
      active: form.get("active") === "on",
      latitude: Number(form.get("latitude")),
      longitude: Number(form.get("longitude")),
      radiusMeters: Number(form.get("radiusMeters")),
      trackingRadiusMeters: Number(form.get("trackingRadiusMeters")),
      trackingGraceMinutes: Number(form.get("trackingGraceMinutes")),
    };
    try {
      await save(
        branch ? `/branches/${branch.id}` : "/branches",
        branch ? "PATCH" : "POST",
        input,
      );
      await saved();
      close();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save branch",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={branch ? "Edit branch" : "Add branch"}
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="branch-editor" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Branch details</legend>
          <Field label="Branch name">
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={branch?.name ?? ""}
            />
          </Field>
          <Field label="Branch code">
            <input
              name="code"
              required
              maxLength={63}
              pattern="[a-z0-9][a-z0-9-]{0,62}"
              defaultValue={branch?.code ?? ""}
            />
          </Field>
          <Field label="Address">
            <textarea
              name="address"
              maxLength={500}
              defaultValue={branch?.address ?? ""}
            />
          </Field>
          <label className="branch-check">
            <input
              name="active"
              type="checkbox"
              defaultChecked={branch?.active ?? true}
            />
            <span>Branch active</span>
          </label>
          <CompanyLocation company={{ ...company, ...branch }} />
          <Field label="Time to return (minutes)">
            <input
              name="trackingGraceMinutes"
              type="number"
              min={1}
              max={120}
              required
              defaultValue={
                branch?.trackingGraceMinutes ?? company.trackingGraceMinutes
              }
            />
          </Field>
          {error && (
            <p role="alert" className="message error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save branch"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
