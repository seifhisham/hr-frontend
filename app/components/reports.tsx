"use client";
import { useEffect, useState } from "react";
import { Download, Printer, RefreshCw, FileText, CalendarDays, Building2 } from "lucide-react";
import {
  api,
  allRequests,
  dateLabel,
  type Attendance,
  type Company,
  type Employee,
  type PayrollDeduction,
} from "../../lib/api";
import {
  employeeLines,
  reportHeaders,
  managementCsv,
  managementHtml,
  reportNote,
  reportRange,
  type ManagementReport,
  type ReportPeriod,
} from "../../lib/management-report";
import { Field } from "./modal";

export function Reports({
  today,
  company,
  preparedBy,
  departments,
  revision,
  onError,
}: {
  today: string;
  company: Company;
  preparedBy: string;
  departments: string[];
  revision: number;
  onError: (error: unknown) => void;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [date, setDate] = useState(today);
  const [department, setDepartment] = useState("");
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    report: ManagementReport;
  } | null>(null);
  const [failure, setFailure] = useState("");
  let range: { from: string; to: string } | null = null;
  let validation = "";
  try {
    range = reportRange(period, date, today);
  } catch (e) {
    validation = e instanceof Error ? e.message : "Invalid date";
  }
  const from = range?.from ?? "";
  const to = range?.to ?? "";
  const key = JSON.stringify([
    period,
    from,
    to,
    department,
    revision,
    version,
    company,
    preparedBy,
  ]);
  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    const query = new URLSearchParams({
      from,
      to,
      ...(department ? { department } : {}),
    });
    Promise.all([
      api<Attendance[]>(`/attendance?${query}`),
      api<Employee[]>("/employees?includeDeleted=true"),
      allRequests(),
      api<PayrollDeduction[]>(
        `/payroll/deductions?${new URLSearchParams({ from, to })}`,
      ),
    ])
      .then(([rows, employees, requests, manualDeductions]) => {
        if (alive)
          setResult({
            key,
            report: {
              period,
              from,
              to,
              department,
              company: company.name,
              timezone: company.timezone,
              preparedBy,
              generatedAt: new Date().toISOString(),
              rows,
              employees,
              requests,
              manualDeductions,
            },
          });
      })
      .catch((e) => {
        if (alive) {
          setFailure(key);
          onError(e);
        }
      });
    return () => {
      alive = false;
    };
  }, [
    key,
    from,
    to,
    department,
    period,
    company.name,
    company.timezone,
    preparedBy,
    onError,
  ]);
  const report = !validation && result?.key === key ? result.report : null;
  const failed = !report && failure === key;
  const loading = !validation && !report && !failed;
  const lines = report ? employeeLines(report) : [];
  function download(content: string, extension: string, mime: string) {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${period}-hr-report-${from}-${to}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function print() {
    if (!report) return;
    const page = window.open("", "_blank");
    if (!page) {
      onError(new Error("Allow pop-ups to open the printable report."));
      return;
    }
    page.opener = null;
    page.document.open();
    page.document.write(managementHtml(report));
    page.document.close();
    page.focus();
    page.print();
  }
  return (
    <section className="section">
      <div className="report-filter-panel">
        <div className="report-panel-intro">
          <span className="report-panel-icon"><FileText size={20} aria-hidden="true" /></span>
          <div>
            <h2>Build your attendance report</h2>
            <p>Choose a period and department. Weekly reports run Sunday–Saturday, up to today.</p>
          </div>
        </div>
      <div className="report-controls">
        <Field label="Report period">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        <Field
          label={period === "daily" ? "Report date" : "Date within the week"}
        >
          <input
            type="date"
            value={date}
            max={today}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Department">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="button secondary"
          disabled={loading || !!validation}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "Generating report…" : "Refresh report"}
        </button>
      </div>
      </div>
      {validation && (
        <p className="message error" role="alert">
          {validation}
        </p>
      )}
      {loading && <p role="status">Generating report...</p>}
      {failed && (
        <p className="message error" role="alert">
          Unable to generate this report. Refresh to try again.
        </p>
      )}
      {report && (
        <>
          <div className="report-summary-panel">
          <div className="section-heading report-heading">
            <div className="report-title">
              <span className="report-period-badge">{period === "daily" ? "Daily" : "Weekly"} attendance</span>
              <h2>{company.name} report</h2>
              <span className="muted">{lines.length} {lines.length === 1 ? "employee" : "employees"} in this report</span>
            </div>
            <div className="report-actions">
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    managementCsv(report),
                    "csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    managementHtml(report),
                    "html",
                    "text/html;charset=utf-8",
                  )
                }
              >
                <Download size={16} />
                Download HTML
              </button>
              <button className="button primary" onClick={print}>
                <Printer size={16} />
                Print / Save PDF
              </button>
            </div>
          </div>
          <div className="report-context">
            <span><CalendarDays size={16} aria-hidden="true" />
              {report.from === report.to ? dateLabel(report.from) : `${dateLabel(report.from)} – ${dateLabel(report.to)}`}
            </span>
            <span><Building2 size={16} aria-hidden="true" />{report.department || "All departments"}</span>
          </div>
          <div className="report-prepared">
            <span>Prepared by <strong>{report.preparedBy}</strong></span>
            <span>Generated {new Intl.DateTimeFormat("en", {
              timeZone: report.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(report.generatedAt))} ({report.timezone})</span>
          </div>
          </div>
          <div className="table-wrap">
            <table className="employee-report-table">
              <thead>
                <tr>
                  {reportHeaders.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.employeeId}>
                    {line.values.map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!lines.length && (
            <div className="empty">
              <strong>No employees for this period</strong>
            </div>
          )}
          <p className="muted">{reportNote}</p>
          <p className="muted">
            Download the report to share with management, or choose Save as PDF
            in the print dialog.
          </p>
        </>
      )}
    </section>
  );
}
