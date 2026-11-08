"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, save, type BankDetails, type PayrollRun } from "../../lib/api";
import type { BankTemplate } from "../../lib/bank-payroll";
import { Field, Modal } from "./modal";

export function BankPayroll({
  run,
  today,
  close,
}: {
  run: PayrollRun;
  today: string;
  close: () => void;
}) {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [valueDate, setValueDate] = useState(today);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<BankTemplate | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api<BankDetails>("/payroll/bank-details")
      .then((saved) => {
        if (alive)
          setDetails({
            settings: saved.settings,
            employees: run.rows.map(
              (row) =>
                saved.employees.find(
                  (entry) => entry.employeeId === row.employeeId,
                ) ?? {
                  employeeId: row.employeeId,
                  beneficiaryName: row.name,
                  account: "",
                  swift: "",
                },
            ),
          });
      })
      .catch((error) => {
        if (alive)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load bank details",
          );
      });
    return () => {
      alive = false;
    };
  }, [run]);

  async function importFile(file?: File) {
    if (!file || !details) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Select an Excel workbook smaller than 5 MB.");
      const { readBankTemplate, matchBankBeneficiaries } =
        await import("../../lib/bank-payroll");
      const imported = await readBankTemplate(await file.arrayBuffer());
      setTemplate(imported);
      setMatches(
        matchBankBeneficiaries(
          run.rows,
          details.employees,
          imported.beneficiaries,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to read bank workbook",
      );
    } finally {
      setBusy(false);
    }
  }
  function applyImport() {
    if (!template || !details) return;
    const selected = matches.filter(Boolean);
    if (new Set(selected).size !== selected.length) {
      setError("Assign each employee to only one bank beneficiary.");
      return;
    }
    setDetails({
      settings: template.settings,
      employees: details.employees.map((entry) => {
        const index = matches.indexOf(entry.employeeId);
        return index < 0
          ? entry
          : { employeeId: entry.employeeId, ...template.beneficiaries[index] };
      }),
    });
    setNotice(
      `${selected.length} bank accounts imported. Review the details, then save.`,
    );
    setTemplate(null);
    setError("");
    setIssues([]);
  }
  async function persist(download: boolean) {
    if (!details) return;
    setBusy(true);
    setError("");
    setNotice("");
    setIssues([]);
    try {
      const output = download
        ? await (
            await import("../../lib/bank-payroll")
          ).createBankWorkbook(run, details, valueDate)
        : null;
      await save("/payroll/bank-details", "POST", details);
      if (output) {
        setIssues(output.issues);
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(output.buffer).buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `Arab-bank-payroll-${run.month}.xlsx`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        output
          ? "Bank details saved and editable Excel downloaded."
          : "Bank details saved for future payroll exports.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save bank details or download payroll",
      );
    } finally {
      setBusy(false);
    }
  }
  const missing =
    details?.employees.filter(
      (entry) => !entry.account || !entry.swift || !entry.beneficiaryName,
    ).length ?? 0;
  return (
    <Modal
      title={`Bank payroll file / ${run.month}`}
      close={() => {
        if (!busy) close();
      }}
      className="bank-payroll-modal"
    >
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {!details && !error && <p role="status">Loading saved bank details...</p>}
      {details && (
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void persist(false);
          }}
        >
          <p>
            {run.rows.length} employees from{" "}
            {run.status === "approved" ? "saved, approved" : "draft"} payroll.
            Payment amounts use net salary after deductions. The Excel file is
            editable; changes to it do not change payroll in the system.
          </p>
          <Field label="Import existing bank workbook (.xlsx)">
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </Field>
          <p className="muted">
            Import once to save accounts. Review unique name matches and assign
            any unmatched beneficiaries before applying. Importing never copies
            old payment amounts or dates.
          </p>
          {template && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bank beneficiary</th>
                      <th>Employee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.beneficiaries.map((entry, index) => (
                      <tr key={index}>
                        <td>{entry.beneficiaryName}</td>
                        <td>
                          <select
                            aria-label={`Employee for ${entry.beneficiaryName}`}
                            value={matches[index]}
                            disabled={busy}
                            onChange={(event) =>
                              setMatches(
                                matches.map((id, i) =>
                                  i === index ? event.target.value : id,
                                ),
                              )
                            }
                          >
                            <option value="">Skip / no match</option>
                            {run.rows.map((row) => (
                              <option
                                key={row.employeeId}
                                value={row.employeeId}
                              >
                                {row.employeeNumber} / {row.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !matches.some(Boolean)}
                onClick={applyImport}
              >
                Apply matched bank details
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setTemplate(null)}
              >
                Cancel import
              </button>
            </>
          )}
          <div className="form-grid">
            <Field label="Payment value date">
              <input
                type="date"
                required
                value={valueDate}
                disabled={busy}
                onChange={(event) => setValueDate(event.target.value)}
              />
            </Field>
            {(
              [
                ["debitAccount", "Company debit account", 34],
                ["transactionTypeCode", "Transaction type code", 20],
                ["purposeCode", "Purpose code", 20],
                ["paymentType", "Payment type", 50],
                ["purposeOfPayment", "Purpose of payment", 120],
              ] as const
            ).map(([key, label, maxLength]) => (
              <Field key={key} label={label}>
                <input
                  value={details.settings[key]}
                  maxLength={maxLength}
                  disabled={busy}
                  onChange={(event) => {
                    setDetails({
                      ...details,
                      settings: {
                        ...details.settings,
                        [key]: event.target.value,
                      },
                    });
                    setIssues([]);
                  }}
                />
              </Field>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Bank beneficiary name</th>
                  <th>Beneficiary account / IBAN</th>
                  <th>SWIFT / IFSC</th>
                </tr>
              </thead>
              <tbody>
                {details.employees.map((entry) => {
                  const employee = run.rows.find(
                    (row) => row.employeeId === entry.employeeId,
                  )!;
                  return (
                    <tr key={entry.employeeId}>
                      <td>
                        {employee.employeeNumber}
                        <br />
                        {employee.name}
                      </td>
                      {(
                        [
                          ["beneficiaryName", 200],
                          ["account", 34],
                          ["swift", 20],
                        ] as const
                      ).map(([key, maxLength]) => (
                        <td key={key}>
                          <input
                            aria-label={`${key} for ${employee.name}`}
                            value={entry[key]}
                            maxLength={maxLength}
                            disabled={busy}
                            onChange={(event) => {
                              setDetails({
                                ...details,
                                employees: details.employees.map((row) =>
                                  row.employeeId === entry.employeeId
                                    ? { ...row, [key]: event.target.value }
                                    : row,
                                ),
                              });
                              setIssues([]);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(missing > 0 ||
            !details.settings.debitAccount ||
            run.rows.some(
              (row) => row.netSalary === null || row.netSalary < 0,
            )) && (
            <p className="message notice">
              Review before sending: {missing} employees have incomplete bank
              details. Missing bank fields and unavailable or negative payment
              amounts are left blank and highlighted in Excel.
            </p>
          )}
          {issues.length > 0 && (
            <details open>
              <summary>
                Fields to complete in the downloaded file ({issues.length}{" "}
                employees)
              </summary>
              <ul>
                {issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {notice && (
            <p className="message notice" role="status">
              {notice}
            </p>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              type="submit"
              disabled={busy || !!template}
            >
              {busy ? "Working..." : "Save bank details"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={busy || !valueDate || !!template}
              onClick={() => void persist(true)}
            >
              Save and download editable Excel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
