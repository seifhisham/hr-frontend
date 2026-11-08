import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/components/employee-delete.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(failure = false) {
  const calls = []; const changes = []; let closed = false; let removed = false;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, encodeURIComponent, Error, require: name => name === "react" ? {
    useState: initial => [initial, value => changes.push(value)],
  } : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "../../lib/api" ? {
    save: async (...args) => { calls.push(args); if (failure) throw new Error("Delete failed"); },
  } : {} };
  vm.runInNewContext(code, context);
  const tree = context.exports.EmployeeDelete({ employee: { id: "employee-one", name: "Test employee", employeeNumber: "EMP-000001" },
    close() { closed = true; }, deleted() { removed = true; } });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props?.children); }
  visit(tree);
  return { calls, changes, nodes, closed: () => closed, removed: () => removed };
}
test("requires confirmation before deleting, then removes the row only after REST succeeds", async () => {
  const ui = setup();
  assert.equal(ui.calls.length, 0);
  await ui.nodes.find(node => node.type === "button" && node.props.children === "Delete employee").props.onClick();
  assert.deepEqual(Array.from(ui.calls[0]), ["/employees/employee-one", "DELETE"]);
  assert.ok(ui.closed()); assert.ok(ui.removed());
});
test("cancel and request failure leave the employee intact", async () => {
  const cancelled = setup();
  cancelled.nodes.find(node => node.type === "button" && node.props.children === "Cancel").props.onClick();
  assert.equal(cancelled.calls.length, 0); assert.equal(cancelled.removed(), false);
  const failed = setup(true);
  await failed.nodes.find(node => node.type === "button" && node.props.children === "Delete employee").props.onClick();
  assert.equal(failed.closed(), false); assert.equal(failed.removed(), false);
  assert.ok(failed.changes.includes("Delete failed"));
});
