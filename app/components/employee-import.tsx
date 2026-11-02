"use client";
import { useEffect, useState, type FormEvent } from "react";
import { send, type Branch, type Schedule, type Employee, type Role } from "../../lib/api";
import { Field, Modal } from "./modal";

type Draft = Omit<Employee, "id" | "employeeNumber" | "accountId">;
type Row = {
  row: number;
  name: string;
  email: string;
  status: "ready" | "invalid" | "skipped" | "created" | "failed";
  message?: string;
  password?: string;
  salarySource: string;
  employee?: Draft;
  draft: Draft;
};

export function EmployeeImport({ branches, schedules, departments, role, employees, workspace, close, saved }: {
  branches: Branch[];
  schedules: Schedule[];
  departments: string[];
  role: Role;
  employees: Employee[];
  workspace: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [rowOverrides, setRowOverrides] = useState<Record<string, Partial<Draft>>>({});
  const [changed, setChanged] = useState(false);
  const created = rows?.filter((row) => row.status === "created") ?? [];
  const ready = rows?.filter((row) => row.status === "ready").length ?? 0;
  useEffect(() => {
    if (!busy && (!created.length || downloaded)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, created.length, downloaded]);
  function finish() {
    if (busy || downloading) return;
    if (created.length && !downloaded && !window.confirm("You have not downloaded the account passwords. Close and discard them?")) return;
    close();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || done) return;
    const form = new FormData(event.currentTarget);
    const preview = rows === null || changed;
    setBusy(true);
    setError("");
    try {
      const result = await send<Row[]>("/employees/import", "POST", {
        csv,
        branchId: form.get("branchId"),
        department: form.get("department"),
        scheduleId: form.get("scheduleId"),
        salaryCurrency: String(form.get("salaryCurrency")).trim().toUpperCase(),
        dateFormat: form.get("dateFormat"),
        rowOverrides,
        ...(form.get("fallbackStartDate") ? { fallbackStartDate: form.get("fallbackStartDate") } : {}),
        preview,
      });
      setRows(result);
      setChanged(false);
      if (!preview) {
        setDone(true);
        try { await saved(); } catch { setError("Import finished. Refresh the employee list after downloading credentials."); }
      }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Unable to import CSV"}${preview ? "" : " Some rows may have been saved. Re-previewing will skip them; use Edit employee to reset any password you did not receive."}`);
      if (!preview) setRows(null);
    } finally {
      setBusy(false);
    }
  }
  function editRow(row: number, changes: Partial<Draft>) {
    setRowOverrides((values) => ({...values, [String(row)]: {...values[String(row)], ...changes}}));
    setChanged(true);
  }
  async function download() {
    setDownloading(true);
    setError("");
    try {
      const [{createCredentialsPdf}, response] = await Promise.all([
        import("../../lib/employee-credentials-pdf"), fetch("/fonts/Amiri-Regular.ttf"),
      ]);
      if (!response.ok) throw new Error("Unable to load the PDF font. Please try again.");
      let font = "";
      new Uint8Array(await response.arrayBuffer()).forEach((byte) => { font += String.fromCharCode(byte); });
      const pdf = createCredentialsPdf(created.map(({name,email,password}) => ({name,email,password:password!})), btoa(font), workspace, window.location.origin);
      await pdf.save("employee-account-passwords.pdf", {returnPromise:true});
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the PDF. Please try again.");
    } finally { setDownloading(false); }
  }
  return (
    <Modal title="Import employee CSV" close={finish} className="employee-import-modal">
      <form onSubmit={submit} className="employee-import-form">
        <div className="employee-import-body">
        <p>In Google Forms, open Responses → Download responses (.csv). Upload up to 100 responses (50 KB). Existing employees are skipped; no records are updated.</p>
        <fieldset className="employee-import-defaults" disabled={busy || done} onChangeCapture={() => { if (rows) setChanged(true); }}>
          <legend>Batch defaults</legend>
          <p>Apply these to the batch, or override any value in an employee card below.</p>
          <div className="form-grid">
            <Field label="Google Forms CSV">
              <input type="file" accept=".csv,text/csv" required onChange={async (event) => {
                const file = event.target.files?.[0];
                setCsv(""); setRows(null); setError(""); setRowOverrides({}); setChanged(false);
                if (!file) return;
                if (file.size > 50000) { setError("CSV exceeds 50 KB. Split it into smaller files, keeping the header row."); return; }
                try { setCsv(await file.text()); } catch { setError("Unable to read the selected file."); }
              }} />
            </Field>
            <Field label="Assigned branch">
              <select name="branchId" required defaultValue=""><option value="" disabled>Select a branch</option>{branches.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
            <Field label="Department for this batch">
              <select name="department" required defaultValue=""><option value="" disabled>Select a department</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </Field>
            <Field label="Work schedule for this batch">
              <select name="scheduleId" required defaultValue=""><option value="" disabled>Select a schedule</option>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
            <Field label="Salary currency"><input name="salaryCurrency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue="EGP" /></Field>
            <Field label="Date format in CSV">
              <select name="dateFormat" defaultValue="ISO"><option value="ISO">YYYY-MM-DD</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option></select>
            </Field>
            <Field label="Joining date for blank answers only"><input name="fallbackStartDate" type="date" /></Field>
          </div>
        </fieldset>
        <p className="employee-import-help">Salary formats: 10k = 10000 · 7.000 = 7000. Expand a card to edit employee details, assignments, or account options. Update the preview after changes. Phone type and timestamps are not imported.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {rows && <>
          <p className="employee-import-summary" role="status">{changed ? "Changes need validation. Update the preview before importing." : done ? `${created.length} created, ${rows.filter((r) => r.status === "failed").length} failed, ${rows.filter((r) => r.status === "skipped").length} skipped.` : `${ready} ready, ${rows.filter((r) => r.status === "invalid").length} invalid, ${rows.filter((r) => r.status === "skipped").length} skipped.`}</p>
          <div className="employee-import-cards">
            {rows.map((r) => {
              const value = {...r.draft, ...rowOverrides[String(r.row)]};
              const label = (field: string) => `${field} for CSV line ${r.row}`;
              return <details className="employee-import-card" key={r.row} open={r.status === "invalid"}>
                <summary><span className="employee-import-row">Line {r.row}</span><span className="employee-import-person"><strong>{value.name || "Unnamed employee"}</strong><small>{value.email}</small></span><span className={`employee-import-status ${r.status}`}>{changed ? "Review changes" : r.status}</span></summary>
                {r.message && <p className="employee-import-row-message" id={`import-row-${r.row}-error`}>{r.message}</p>}
                <fieldset disabled={busy || done} aria-label={`Employee details for CSV line ${r.row}`}>
                  <div className="form-grid">
                    <Field label="Full name"><input aria-label={label("Full name")} maxLength={120} value={value.name} onChange={(e) => editRow(r.row,{name:e.target.value})} /></Field>
                    <Field label="National ID"><input aria-label={label("National ID")} type="text" maxLength={120} value={value.nationalId} onChange={(e) => editRow(r.row,{nationalId:e.target.value})} /></Field>
                    <Field label="Email"><input aria-label={label("Email")} type="email" value={value.email} onChange={(e) => editRow(r.row,{email:e.target.value})} /></Field>
                    <Field label="Job title"><input aria-label={label("Job title")} maxLength={120} value={value.jobTitle} onChange={(e) => editRow(r.row,{jobTitle:e.target.value})} /></Field>
                    <Field label="Joining date"><input aria-label={label("Joining date")} type="date" value={value.startDate} onChange={(e) => editRow(r.row,{startDate:e.target.value})} /></Field>
                    <Field label="Monthly salary"><input aria-label={label("Monthly salary")} type="number" min="0" max="1000000000" step="0.01" value={value.monthlySalary ?? ""} aria-describedby={`import-salary-${r.row}`} placeholder="Enter salary" onChange={(e) => editRow(r.row,{monthlySalary:e.target.value === "" ? null : Number(e.target.value)})} /><small id={`import-salary-${r.row}`}>CSV answer: {r.salarySource || "blank"}</small></Field>
                    <Field label="Salary currency"><input aria-label={label("Salary currency")} pattern="[A-Z]{3}" maxLength={3} value={value.salaryCurrency} onChange={(e) => editRow(r.row,{salaryCurrency:e.target.value.toUpperCase()})} /></Field>
                    <Field label="Branch"><select aria-label={label("Branch")} value={value.branchId ?? ""} onChange={(e) => editRow(r.row,{branchId:e.target.value})}>{branches.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                    <Field label="Department"><select aria-label={label("Department")} value={value.department} onChange={(e) => editRow(r.row,{department:e.target.value})}>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
                    <Field label="Work schedule"><select aria-label={label("Work schedule")} value={value.scheduleId} onChange={(e) => editRow(r.row,{scheduleId:e.target.value})}>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                    <Field label="Access role"><select aria-label={label("Access role")} value={value.role} onChange={(e) => editRow(r.row,{role:e.target.value as Role})}><option value="employee">Employee</option><option value="manager">Manager</option>{role === "admin" && <><option value="hr">HR staff</option><option value="admin">Administrator</option></>}</select></Field>
                    <Field label="Direct manager"><select aria-label={label("Direct manager")} value={value.managerId ?? ""} onChange={(e) => editRow(r.row,{managerId:e.target.value || null})}><option value="">No manager</option>{employees.filter((e) => e.active && e.role !== "employee").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
                    <label className="check-label"><input aria-label={label("Active employee")} type="checkbox" checked={value.active} onChange={(e) => editRow(r.row,{active:e.target.checked})} />Active employee</label>
                    <label className="check-label"><input aria-label={label("Sales access")} type="checkbox" checked={value.salesEnabled} onChange={(e) => editRow(r.row,{salesEnabled:e.target.checked})} />Sales access</label>
                  </div>
                </fieldset>
              </details>;
            })}
          </div>
        </>}
        </div>
        <div className="modal-footer">
          {!done && <button className="button primary" disabled={busy || !csv || (rows !== null && !changed && !ready)}>{busy ? "Processing…" : changed ? "Update preview" : rows ? `Import ${ready} employees` : "Preview CSV"}</button>}
          {created.length > 0 && <button className="button primary" type="button" disabled={downloading} onClick={download}>{downloading ? "Creating PDF…" : "Download passwords PDF"}</button>}
          <button className="button secondary" type="button" disabled={busy || downloading} onClick={finish}>Close</button>
        </div>
      </form>
    </Modal>
  );
}
