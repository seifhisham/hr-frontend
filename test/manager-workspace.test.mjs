import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL("../app/components/manager-workspace.tsx", import.meta.url))), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function render(view) {
  const calls = [];
  let index = 0;
  const values = [view, false, [], null, "2026-10-14", "2026-10-14", 0];
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, URLSearchParams, require: (name) => name === "react" ? {
    useState: () => [values[index++], () => {}], useEffect: (effect) => effect(),
  } : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "../../lib/api" ? {
    api: async (path) => { calls.push(path); return []; }, dateLabel: (date) => date, initials: () => "SM",
  } : {} };
  vm.runInNewContext(code, context);
  const tree = context.exports.ManagerWorkspace({ session: { today: "2026-10-14", user: { name: "Sales Manager", employeeId: "manager-id" }, company: { name: "Company", timezone: "Africa/Cairo" } }, logout: () => {}, onError: () => {}, error: "" });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props?.children); }
  visit(tree);
  return { calls, nodes };
}
test("manager navigation exposes only manager pages and opens team requests", () => {
  const { nodes, calls } = render("team");
  const nav = nodes.find((node) => node.type === "nav");
  assert.equal(nav.props.children.length, 4);
  assert.equal(nav.props.children[0].props["aria-current"], "page");
  assert.equal(nodes.some((node) => node.type === "details"), false);
  assert.deepEqual(calls, ["/employees/reports"]);
  const request = nodes.find((node) => node.props?.manager);
  assert.equal(request.props.employeeId, "manager-id");
});
test("manager attendance loads only on its selected page", () => {
  const { calls, nodes } = render("attendance");
  assert.equal(calls.length, 2);
  assert.equal(calls[1], "/attendance?from=2026-10-14&to=2026-10-14");
  assert.equal(nodes.find((node) => node.props?.className === "table-wrap").props["aria-busy"], true);
});
