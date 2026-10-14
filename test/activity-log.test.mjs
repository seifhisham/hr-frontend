import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../app/components/activity-log.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function render(count, filters = "", cursors = []) {
  const listKey = JSON.stringify([filters, 0, 0]);
  const key = JSON.stringify([listKey, cursors.at(-1)]);
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i), at: "2026-10-14T10:00:00Z", actor: "Actor", action: "employee.updated", recordId: "employee" }));
  const values = [filters, 0, { key: listKey, cursors }, { key, rows }, null];
  let index = 0;
  const updates = [], calls = [];
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, URLSearchParams, require: (name) => name === "react" ? {
    useState: () => { const i = index++; return [values[i], (v) => updates.push([i, v])]; }, useEffect: (effect) => effect(),
  } : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "../../lib/api" ? {
    api: async (path) => { calls.push(path); return []; },
  } : name === "../../lib/audit-display" ? { auditLabel: (value) => value } : {} };
  vm.runInNewContext(code, context);
  const tree = context.exports.ActivityLog({ timezone: "UTC", revision: 0, onError: () => {} });
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== "object") return; nodes.push(node); visit(node.props?.children); }
  visit(tree);
  return { nodes, updates, calls };
}
test("audit pagination uses lookahead without showing the extra row and sends active filters", () => {
  const { nodes, updates, calls } = render(51, "search=employee", ["older"]);
  const query = new URLSearchParams(calls[0].split("?")[1]);
  assert.equal(query.get("limit"), "51"); assert.equal(query.get("search"), "employee"); assert.equal(query.get("before"), "older");
  assert.equal(nodes.filter((n) => n.type === "tr").length, 51);
  const next = nodes.find((n) => n.type === "button" && n.props.children?.[0] === "Next");
  assert.equal(next.props.disabled, false); next.props.onClick();
  assert.equal(updates[0][1].cursors.at(-1), "49");
  const detail = nodes.find((n) => n.type === "button" && n.props.children === "View details"); detail.props.onClick();
  assert.equal(updates[1][1].id, "0");
});
test("audit pagination disables Next on a full final page", () => {
  const { nodes } = render(50);
  assert.equal(nodes.find((n) => n.type === "button" && n.props.children?.[0] === "Next").props.disabled, true);
});
