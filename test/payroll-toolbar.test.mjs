import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(
    new URL("../app/components/payroll.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function render({
  rows = [{ grossSalary: 0 }],
  month = "2026-11",
  status = "draft",
  canApprove = true,
} = {}) {
  rows = rows.map((row, index) => ({
    employeeId: String(index),
    employeeNumber: "EMP-000001",
    name: "Test employee",
    department: "Sales",
    active: true,
    currency: "EGP",
    dailyRate: 0,
    deductionDays: 0,
    deductionAmount: 0,
    netSalary: 0,
    deductions: [],
    manualDeductions: [],
    ...row,
  }));
  const run = {
    month,
    status,
    rows,
    timezone: "Africa/Cairo",
    approvedAt: "2026-11-01T08:00:00Z",
  };
  const state = [
    month,
    null,
    null,
    false,
    0,
    { month, revision: 0, version: 0, run },
    null,
  ];
  const changes = new Map();
  let index = 0;
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {},
    Intl,
    require: (name) =>
      name === "react"
        ? {
            useState: () => {
              const key = index++;
              return [state[key], (value) => changes.set(key, value)];
            },
            useEffect() {},
          }
        : name === "react/jsx-runtime"
          ? { jsx, jsxs: jsx }
          : {},
  };
  vm.runInNewContext(code, context);
  const tree = context.exports.Payroll({
    today: "2026-11-08",
    revision: 0,
    canApprove,
    onError() {},
  });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { nodes, changes, run };
}
const approval = (nodes) =>
  nodes.find(
    (node) =>
      node.type === "button" &&
      node.props.children === "Approve and lock month",
  );

test("explains each disabled approval state next to the control", () => {
  for (const [options, reason] of [
    [{ rows: [] }, /No employees/],
    [{ rows: [{ grossSalary: null }] }, /missing salaries/],
    [{ month: "2026-12" }, /month begins/],
  ]) {
    const { nodes } = render(options);
    const button = approval(nodes);
    assert.equal(button.props.disabled, true);
    assert.ok(
      button.props["aria-describedby"],
      "Approval must explain why it is disabled",
    );
    const hint = nodes.find(
      (node) => node.props.id === button.props["aria-describedby"],
    );
    assert.ok(hint, "Disabled approval must reference its explanation");
    assert.match(hint.props.children, reason);
  }
});
test("preserves approval permissions and both action handlers", () => {
  const ready = render();
  assert.equal(approval(ready.nodes).props.disabled, false);
  approval(ready.nodes).props.onClick();
  assert.equal(ready.changes.get(2), ready.run);
  ready.nodes
    .find(
      (node) =>
        node.type === "button" && node.props["aria-haspopup"] === "dialog",
    )
    .props.onClick();
  assert.equal(ready.changes.get(3), true);
  assert.equal(approval(render({ canApprove: false }).nodes), undefined);
  assert.equal(approval(render({ status: "approved" }).nodes), undefined);
});
