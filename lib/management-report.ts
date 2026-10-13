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
  const ids = new Set(lines.map((line) => line.employeeId));
  const records = report.rows
    .filter((row) => ids.has(row.employeeId) && row.workDate >= report.from && row.workDate <= report.to)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.name.localeCompare(b.name));
  const number = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat("en", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
  const generated = new Intl.DateTimeFormat("en", { timeZone: report.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(report.generatedAt));
  const time = (value: string | null, timezone: string) => value
    ? new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
    : "--";
  const checkedIn = records.filter((row) => row.checkIn);
  const open = checkedIn.filter((row) => !row.checkOut).length;
  const late = records.filter((row) => row.late).length;
  const metrics = [
    ["Employees in scope", number(lines.length)],
    ["Recorded check-ins", number(checkedIn.length)],
    ["Late records", number(late)],
    ["Deduction days", number(lines.reduce((sum, line) => sum + Number(line.values[4]), 0))],
  ];
  const table = (headers: string[], rows: string[][]) => `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th scope="col">${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escape(value).replaceAll("; ", "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.company)} - ${title}</title><style>
  *{box-sizing:border-box}body{font:14px/1.55 Arial,sans-serif;color:#24352f;background:#f1f4f3;margin:0;padding:32px}main{max-width:1300px;margin:auto;background:#fff;padding:36px;border:1px solid #d8e1dd}header{border-top:5px solid #245b47;border-bottom:1px solid #d8e1dd;padding:20px 0;margin-bottom:24px}.eyebrow{font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#476456;margin:0}h1{font-size:30px;line-height:1.2;margin:8px 0 16px}h2{font-size:19px;margin:28px 0 6px;break-after:avoid}p{margin:8px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px}.meta strong{display:block;color:#52655b;font-size:11px;text-transform:uppercase}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.metric{border:1px solid #d8e1dd;border-top:3px solid #245b47;padding:14px}.metric strong{display:block;font-size:27px;line-height:1.3}.metric span,.caption{font-size:12px;color:#52655b}.notice{background:#f3f6f4;border-left:3px solid #a5b9ad;padding:12px 16px;font-size:12px}.table-wrap{overflow-x:auto;margin:14px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 9px;border-bottom:1px solid #d8e1dd;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf1ed;color:#264b3a;font-size:11px}tbody tr:nth-child(even){background:#f7f9f8}thead{display:table-header-group}tr{break-inside:avoid}td{min-width:70px}.notes{font-size:12px;color:#52655b}.notes li{margin:6px 0}footer{border-top:1px solid #d8e1dd;margin-top:28px;padding-top:12px;font-size:11px;color:#52655b}@page{size:A4 landscape;margin:12mm}@media(max-width:700px){body{padding:12px}main{padding:20px}.metrics,.meta{grid-template-columns:1fr 1fr}table{min-width:850px}}@media print{body{background:white;padding:0;font-size:11px}main{max-width:none;padding:0;border:0}h1{font-size:25px}table{font-size:10px;min-width:0}th,td{padding:7px 6px}.table-wrap{overflow:visible}.metrics,.meta{grid-template-columns:repeat(4,1fr)}.meta{grid-template-columns:1fr 1fr}.metric,.notice,header{break-inside:avoid}.attendance-log{break-before:page}footer{break-inside:avoid}}
  </style></head><body><main><header><p class="eyebrow">${escape(report.company)} / Management report</p><h1>${title}</h1><div class="meta"><div><strong>Reporting period</strong>${escape(date(report.from))} to ${escape(date(report.to))}</div><div><strong>Department</strong>${escape(report.department || "All departments")}</div><div><strong>Prepared by</strong>${escape(report.preparedBy)}</div><div><strong>Generated</strong>${escape(generated)} (${escape(report.timezone)})</div></div></header>
  <section><h2>01 / Executive summary</h2><p class="caption">Figures cover the selected period and department. Check-in and lateness counts are attendance records, not unique employees.</p><div class="metrics">${metrics.map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("")}</div><p class="notice"><strong>Review focus:</strong> ${number(open)} checked-in record(s) have no recorded check-out. ${number(lines.filter((line) => !checkedIn.some((row) => row.employeeId === line.employeeId)).length)} employee(s) have no recorded check-in in this period. These are review indicators; missing records do not establish absence. Current-day attendance may still be in progress.</p></section>
  <section><h2>02 / Employee register</h2><p class="caption">One row per employee, including leave, approval decisions and salary-day deductions. Weekly times are listed by workday.</p>${lines.length ? table(reportHeaders, lines.map((line) => line.values)) : "<p>No employees for this period.</p>"}</section>
  <section class="attendance-log"><h2>03 / Attendance detail</h2><p class="caption">Ordered by workday, then employee. Times use each attendance record's timezone. Hours are the recorded values; incomplete records show --.</p>${records.length ? table(["Workday", "Employee", "Department", "Check-in", "Check-out", "Status", "Late", "Hours", "Timezone"], records.map((row) => [date(row.workDate), lines.find((line) => line.employeeId === row.employeeId)!.values[0], row.department, time(row.checkIn, row.timezone), time(row.checkOut, row.timezone), row.status ? row.status.replaceAll("-", " ") : "--", row.late ? "Yes" : "No", row.hours == null ? "--" : number(row.hours), row.timezone])) : "<p>No attendance records for this period.</p>"}</section>
  <section class="notes"><h2>04 / Reading this report</h2><ul><li>Deduction days are salary days, not currency amounts. Request deductions are counted once, using their decision date in the company timezone. Pending requests carry no deduction.</li><li>Manual deductions are counted by recording date and may apply to a different payroll month. This report is not a payroll settlement.</li><li>Leave and excuses include requests overlapping the reporting period, with their current status. Decisions made during the period may also refer to requests outside it.</li><li>-- means no recorded value. Today's attendance is provisional. Weekly periods run Sunday to Saturday and the current week ends on the report's end date.</li></ul></section><footer>${escape(report.company)} | ${escape(date(report.from))} to ${escape(date(report.to))} | Confidential - personnel information</footer></main></body></html>`;
}
