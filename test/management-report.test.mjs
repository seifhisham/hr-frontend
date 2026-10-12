import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const source = readFileSync(
  new URL("../lib/management-report.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const context = {
  exports: {},
  require: createRequire(import.meta.url),
  Date,
  Intl,
  Map,
};
vm.runInNewContext(code, context);
const { reportRange, employeeLines, managementHtml, managementCsv } =
  context.exports;
const employee = (id = "one", department = "Sales") => ({
  id,
  employeeNumber: "EMP-000001",
  name: "Employee",
  department,
  startDate: "2026-10-01",
  active: true,
});
const attendance = (changes = {}) => ({
  employeeId: "one",
  name: "Employee",
  department: "Sales",
  workDate: "2026-10-04",
  checkIn: "2026-10-04T07:00:00Z",
  checkOut: null,
  timezone: "Africa/Cairo",
  ...changes,
});
const base = (changes = {}) => ({
  period: "daily",
  from: "2026-10-04",
  to: "2026-10-04",
  timezone: "Africa/Cairo",
  company: "Company",
  department: "",
  preparedBy: "HR",
  generatedAt: "2026-10-04T08:00:00Z",
  rows: [],
  employees: [employee()],
  requests: [],
  manualDeductions: [],
  ...changes,
});
const request = (changes = {}) => ({
  id: "request",
  employeeId: "one",
  type: "excuse",
  from: "2026-10-04",
  to: "2026-10-04",
  excuseType: "leaving-early",
  durationMinutes: 15,
  status: "approved",
  decidedAt: "2026-10-04T08:00:00Z",
  decidedBy: "Reviewer",
  salaryDeductionDays: 1,
  ...changes,
});

test("weekly boundaries and invalid dates", () => {
  assert.deepEqual(
    { ...reportRange("weekly", "2026-10-01", "2026-10-05") },
    { from: "2026-09-27", to: "2026-10-03" },
  );
  assert.deepEqual(
    { ...reportRange("weekly", "2026-10-05", "2026-10-05") },
    { from: "2026-10-04", to: "2026-10-05" },
  );
  for (const date of ["", "2026-02-29", "2026-10-06"])
    assert.throws(() => reportRange("daily", date, "2026-10-05"));
});
test("one row per employee, with dated weekly check-ins and readable missing values", () => {
  const lines = employeeLines(
    base({
      period: "weekly",
      to: "2026-10-05",
      rows: [
        attendance(),
        attendance({ workDate: "2026-10-05", checkIn: null }),
      ],
    }),
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].values[2], "2026-10-04: 10:00; 2026-10-05: --");
  assert.equal(lines[0].values[3], "2026-10-04: --; 2026-10-05: --");
  assert.equal(employeeLines(base())[0].values[3], "--");
});
test("deductions use company decision dates and include manual approvals without charging overlapping requests twice", () => {
  const report = base({
    requests: [
      request({ from: "2026-10-01", to: "2026-10-07" }),
      request({
        id: "rejected",
        status: "rejected",
        decidedBy: "Second HR",
        salaryDeductionDays: 3,
      }),
      request({ id: "old", decidedAt: "2026-10-02T08:00:00Z" }),
      request({
        id: "pending",
        status: "pending",
        decidedAt: null,
        salaryDeductionDays: null,
      }),
      request({ id: "nextDay", decidedAt: "2026-10-04T22:00:00Z" }),
    ],
    manualDeductions: [
      {
        id: "manual",
        employeeId: "one",
        days: 2,
        approvedBy: "Manager",
        recordedAt: "2026-10-04T08:00:00Z",
        month: "2026-11",
      },
    ],
  });
  const line = employeeLines(report)[0].values;
  assert.equal(line[4], "6");
  assert.ok(line[5].includes("Second HR"));
  assert.ok(line[5].includes("Manual deduction (2 days): Manager"));
  assert.ok(line[6].includes("leaving early (15 min)"));
  assert.ok(line[6].includes("pending"));
});
test("department filtering includes employees without attendance and keeps duplicate names distinct", () => {
  const report = base({
    department: "Sales",
    employees: [employee(), employee("two"), employee("three", "Operations")],
  });
  const lines = employeeLines(report);
  assert.equal(lines.length, 2);
  assert.equal(new Set(lines.map((r) => r.employeeId)).size, 2);
});
test("HTML and CSV have one employee row, escape content and contain no corrupted missing-value symbols", () => {
  const report = base({
    employees: [
      {
        ...employee(),
        name: '=HYPERLINK("bad")',
        department: "<script>bad</script>",
      },
    ],
    rows: [attendance()],
  });
  const html = managementHtml(report),
    csv = managementCsv(report);
  assert.equal((html.match(/<tbody><tr>/g) || []).length, 1);
  assert.ok(html.includes("<td>--</td>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(csv.includes("\"'=HYPERLINK("));
  for (const output of [html, csv]) {
    assert.ok(!output.includes("â"));
    assert.ok(!output.includes("Â"));
    assert.ok(!output.includes("Job title"));
  }
});
