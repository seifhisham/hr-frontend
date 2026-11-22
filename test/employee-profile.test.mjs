import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/components/employee-profile.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(code, context);
const { attendanceWindow, employmentMonths } = context.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("attendance windows stay within the 93-day API limit and stop at the start date", () => {
  const first = attendanceWindow("2026-11-23", "2025-01-01", 0);
  assert.deepEqual(plain(first), { from: "2026-08-23", to: "2026-11-23" });
  assert.equal((Date.parse(first.to) - Date.parse(first.from)) / 86400000, 92);
  assert.equal(attendanceWindow("2026-11-23", "2025-01-01", 1).to, "2026-08-22");
  assert.deepEqual(plain(attendanceWindow("2026-11-23", "2026-11-01", 0)), { from: "2026-11-01", to: "2026-11-23" });
  assert.equal(attendanceWindow("2026-11-23", "2026-11-01", 1), null);
  assert.equal(attendanceWindow("2026-11-23", "2026-12-01", 0), null);
});

test("employment months run newest first across years", () => {
  assert.deepEqual(plain(employmentMonths("2027-02-10", "2026-11-20")), ["2027-02", "2027-01", "2026-12", "2026-11"]);
  assert.deepEqual(plain(employmentMonths("2026-11-23", "2027-01-01")), ["2026-11"]);
});
