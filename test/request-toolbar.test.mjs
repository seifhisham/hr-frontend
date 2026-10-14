import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("request component source is valid UTF-8", () => {
  const bytes = readFileSync(new URL("../app/components/requests.tsx", import.meta.url));
  assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
});

const code = ts.transpileModule(
  readFileSync(new URL("../app/components/requests.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } },
).outputText;

function render({ size = 25, status = "pending", cursor = [], loaded = true, count = 25 } = {}) {
  const calls = [];
  const updates = [];
  const listKey = JSON.stringify([0, 0, false, false, status, size]);
  const key = JSON.stringify([listKey, cursor.at(-1)]);
  const states = [status, size, null, 0, { key: listKey, cursors: cursor }, loaded ? { key, rows: Array.from({ length: count }, (_, i) => ({ id: String(i), submittedAt: "2026-10-14T10:00:00Z" })) } : null];
  let index = 0;
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, URLSearchParams,
    require: (name) => name === "react" ? {
      useState: () => { const i = index++; return [states[i], (value) => updates.push([i, value])]; },
      useEffect: (effect) => effect(),
    } : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "../../lib/api" ? {
      dateLabel: (value) => value, api: async (path) => { calls.push(path); return []; },
    } : {},
  };
  vm.runInNewContext(code, context);
  const tree = context.exports.Requests({ revision: 0, onError: () => {}, timezone: "UTC" });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { calls, updates, nodes };
}

test("request toolbar sends selected page size and status with its cursor", () => {
  const { calls, nodes } = render({ size: 100, cursor: ["previous"], count: 7 });
  const query = new URLSearchParams(calls[0].split("?")[1]);
  assert.equal(query.get("limit"), "100");
  assert.equal(query.get("status"), "pending");
  assert.equal(query.get("before"), "previous");
  assert.equal(nodes.find((n) => n.props?.className === "request-page-number").props.children.join(""), "Page 2");
  const next = nodes.find((n) => n.type === "button" && n.props.children?.[0] === "Next");
  assert.equal(next.props.disabled, true);
});

test("request toolbar disables navigation while loading and selects filters", () => {
  const { nodes, updates } = render({ loaded: false, cursor: ["previous"] });
  const nav = nodes.find((n) => n.type === "nav");
  assert.ok(nav.props.children.filter((n) => n.type === "button").every((n) => n.props.disabled));
  const approved = nodes.find((n) => n.type === "button" && n.props.children?.[1] === "Approved");
  approved.props.onClick();
  assert.deepEqual(updates[0], [0, "approved"]);
  const select = nodes.find((n) => n.type === "select");
  select.props.onChange({ target: { value: "50" } });
  assert.deepEqual(updates[1], [1, 50]);
  assert.equal(new URLSearchParams(render({ status: "", size: 50 }).calls[0].split("?")[1]).has("before"), false);
});

