import type {
  Attendance,
  Employee,
  EmployeeRequest,
  PayrollDeduction,
} from "./api";

export type ReportPeriod = "daily" | "weekly";
export function reportRange(period: ReportPeriod, date: string, today: string) {
  const value = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== date ||
    date > today
  )
    throw new Error("Select a valid date on or before today.");
  const shift = (days: number) =>
    new Date(value.getTime() + days * 86400000).toISOString().slice(0, 10);
  const from = period === "daily" ? date : shift(-value.getUTCDay());
  const end = period === "daily" ? date : shift(6 - value.getUTCDay());
  return { from, to: end > today ? today : end };
}

export type ManagementReport = {
  period: ReportPeriod;
  from: string;
  to: string;
  department: string;
  company: string;
  timezone: string;
  preparedBy: string;
  generatedAt: string;
  rows: Attendance[];
  employees: Employee[];
  requests: EmployeeRequest[];
  manualDeductions: PayrollDeduction[];
};
const names: Record<EmployeeRequest["type"], string> = {
  leave: "Normal vacation",
  holiday: "Personal holiday",
  sick: "Sick",
  unpaid: "Unpaid",
  urgent: "Urgent",
  excuse: "Excuse",
  mission: "Mission",
  "forgotten-check-out": "Forgotten check-out",
};
export const reportHeaders = [
  "Employee",
  "Department",
  "Check-in",
  "Check-out",
  "Deduction (salary days)",
  "Approved / decided by",
  "Leave / excuse",
];
export const reportNote =
  "One row per employee. Weekly attendance times include workday dates. Deduction days are counted by decision/recording date in the company timezone, once per request; pending requests have no deduction. Leave/excuses show requests overlapping the period with their status. Today's attendance is provisional. -- means no recorded value. Manual deductions may apply to a different payroll month.";
export function companyDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function employeeLines(report: ManagementReport) {
  const inPeriod = (value: string) => {
    const date = companyDate(value, report.timezone);
    return date >= report.from && date <= report.to;
  };
  const relevantRequest = (r: EmployeeRequest) =>
    r.type === "forgotten-check-out"
      ? !!r.attendance &&
        r.attendance.workDate >= report.from &&
        r.attendance.workDate <= report.to
      : !!r.from && !!r.to && r.from <= report.to && r.to >= report.from;
  const decided = report.requests.filter(
    (r) =>
      r.status !== "pending" &&
      r.salaryDeductionDays != null &&
      r.decidedAt &&
      inPeriod(r.decidedAt),
  );
  const manual = report.manualDeductions.filter((r) => inPeriod(r.recordedAt));
  const people = new Map(
    report.employees
      .filter(
        (e) =>
          e.startDate <= report.to &&
          (e.active ||
            report.rows.some((r) => r.employeeId === e.id) ||
            decided.some((r) => r.employeeId === e.id) ||
            manual.some((r) => r.employeeId === e.id) ||
            report.requests.some(
              (r) => r.employeeId === e.id && relevantRequest(r),
            )),
      )
      .map((e) => [
        e.id,
        {
          id: e.id,
          name: `${e.name} (${e.employeeNumber})`,
          department: e.department,
        },
      ]),
  );
  for (const row of report.rows)
    if (!people.has(row.employeeId))
      people.set(row.employeeId, {
        id: row.employeeId,
        name: row.name,
        department: row.department,
      });
  return [...people.values()]
    .filter((e) => !report.department || e.department === report.department)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((employee) => {
      const records = report.rows
        .filter((r) => r.employeeId === employee.id)
        .sort((a, b) => a.workDate.localeCompare(b.workDate));
      const times = (field: "checkIn" | "checkOut") =>
        records
          .map((r) => {
            const value = r[field]
              ? new Intl.DateTimeFormat("en", {
                  timeZone: r.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                }).format(new Date(r[field]!))
              : "--";
            return report.period === "weekly"
              ? `${r.workDate}: ${value}`
              : value;
          })
          .join("; ") || "--";
      const charges = decided.filter((r) => r.employeeId === employee.id);
      const manualCharges = manual.filter((r) => r.employeeId === employee.id);
      const requests = report.requests.filter(
        (r) =>
          r.employeeId === employee.id &&
          (relevantRequest(r) || charges.some((c) => c.id === r.id)),
      );
      const deductionDays =
        charges.reduce((sum, r) => sum + r.salaryDeductionDays!, 0) +
        manualCharges.reduce((sum, r) => sum + r.days, 0);
      const approvals =
        [
          ...requests
            .filter((r) => r.status !== "pending")
            .map(
              (r) =>
                `${names[r.type]} (${r.status}): ${r.decidedBy || "Not recorded"}`,
            ),
          ...manualCharges.map(
            (r) => `Manual deduction (${r.days} days): ${r.approvedBy}`,
          ),
        ].join("; ") || "--";
      const excuses =
        requests
          .map((r) => {
            const detail =
              r.type === "excuse"
                ? ` - ${r.excuseType?.replaceAll("-", " ")} (${r.durationMinutes} min)`
                : "";
            const dates =
              r.type === "forgotten-check-out"
                ? (r.attendance?.workDate ?? "")
                : `${r.from} to ${r.to}`;
            return `${names[r.type]}${detail} (${r.status}, ${dates})`;
          })
          .join("; ") || "None";
      return {
        employeeId: employee.id,
        values: [
          employee.name,
          employee.department,
          times("checkIn"),
          times("checkOut"),
          String(deductionDays),
          approvals,
          excuses,
        ],
      };
    });
}
export function managementCsv(report: ManagementReport) {
  const rows = [
    [
      report.company,
      `${report.period === "daily" ? "Daily" : "Weekly"} attendance report`,
    ],
    ["Period", report.from, report.to],
    ["Department", report.department || "All departments"],
    ["Prepared by", report.preparedBy],
    ["Generated", report.generatedAt, report.timezone],
    [],
    reportHeaders,
    ...employeeLines(report).map((r) => r.values),
    [],
    ["Notes", reportNote],
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function managementHtml(report: ManagementReport) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const title = `${report.period === "daily" ? "Daily" : "Weekly"} attendance report`;
  const lines = employeeLines(report);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.company)} - ${title}</title><style>body{font:13px Arial,sans-serif;color:#19392d;margin:28px}h1{font-size:24px}p{line-height:1.6}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border:1px solid #cbd8d1;text-align:left;overflow-wrap:anywhere}th{background:#edf4ef}thead{display:table-header-group}tr{break-inside:avoid}.notes{font-size:11px;color:#52635a}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style></head><body><p>${escape(report.company)}</p><h1>${title}</h1><p>${escape(report.from)} to ${escape(report.to)} | ${escape(report.department || "All departments")}<br>Prepared by ${escape(report.preparedBy)} | Generated ${escape(report.generatedAt)} (${escape(report.timezone)})</p><table><thead><tr>${reportHeaders.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${lines.map((r) => `<tr>${r.values.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>${!lines.length ? "<p>No employees for this period.</p>" : ""}<p class="notes">${escape(reportNote)}</p></body></html>`;
}
