import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/components/bank-payroll.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const details = {
  settings: { debitAccount: "0012345678901", transactionTypeCode: "BT", purposeCode: "13", paymentType: "SALARY", purposeOfPayment: "SALARY" },
  employees: [{ employeeId: "employee-one", beneficiaryName: "Test employee", account: "0000987654321", swift: "ARABEGXXXX" }],
};
const run = { month: "2026-11", status: "approved", rows: [{ employeeId: "employee-one", employeeNumber: "EMP-000001", name: "Test employee", netSalary: 1000 }] };
function render(template = null, matches = []) {
  const state = [structuredClone(details), "2026-11-30", "", "", false, template, matches, []];
  const changes = new Map(); const calls = [];
  let index = 0;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, require: name => name === "react" ? {
    useEffect() {}, useState: () => { const key = index++; return [state[key], value => changes.set(key, value)]; },
  } : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "../../lib/api" ? {
    save: async (...args) => { calls.push(args); },
  } : {} };
  vm.runInNewContext(code, context);
  const tree = context.exports.BankPayroll({ run, today: "2026-11-30", close() {} });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props?.children); }
  visit(tree);
  return { nodes, calls, changes };
}

test("saves bank edits through REST without changing approved payroll", async () => {
  const { nodes, calls } = render();
  await nodes.find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/payroll/bank-details");
  assert.equal(calls[0][1], "POST");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), details);
});
test("applies manually assigned beneficiaries and rejects duplicate assignments", () => {
  const template = { settings: details.settings, beneficiaries: [{ beneficiaryName: "Bank name", account: "000000123", swift: "ARABEGXXXX" }] };
  const result = render(template, ["employee-one"]);
  result.nodes.find(node => node.type === "button" && node.props.children === "Apply matched bank details").props.onClick();
  assert.equal(result.changes.get(0).employees[0].account, "000000123");
  assert.equal(result.changes.get(0).employees[0].beneficiaryName, "Bank name");
  const duplicate = render({ ...template, beneficiaries: [...template.beneficiaries, ...template.beneficiaries] }, ["employee-one", "employee-one"]);
  duplicate.nodes.find(node => node.type === "button" && node.props.children === "Apply matched bank details").props.onClick();
  assert.match(duplicate.changes.get(2), /only one/);
  assert.equal(duplicate.changes.has(0), false);
});
