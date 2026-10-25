import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/audit-display.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
test("audit actions and field names become readable labels", () => {
  assert.equal(context.exports.auditLabel("sales.target.saved"), "Sales target saved");
  assert.equal(context.exports.auditLabel("request.approved"), "Request approved");
  assert.equal(context.exports.auditLabel("salaryDeductionDays"), "Salary deduction days");
  assert.equal(context.exports.auditLabel("owner.signed_in"), "Owner signed in");
  assert.equal(context.exports.auditLabel("owner.credentials_enrolled"), "Owner credentials enrolled");
  assert.equal(context.exports.auditLabel("owner.bootstrap_started"), "Owner bootstrap started");
});
test("audit snapshots keep nested values, lists, false, zero, and missing values", () => {
  const fields = context.exports.auditFields({ active: false, days: 0, schedule: { name: "Morning" }, items: ["One", "Two"], reason: null });
  const data = new Map(fields.map((item) => [item.field, item.value]));
  assert.equal(data.get("Active"), "No"); assert.equal(data.get("Days"), "0");
  assert.equal(data.get("Schedule / Name"), "Morning"); assert.equal(data.get("Items / Item 2"), "Two");
  assert.equal(data.get("Reason"), "Not set"); assert.equal(context.exports.auditFields(null).length, 0);
});
