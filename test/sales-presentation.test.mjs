import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = new TextDecoder("utf-8", { fatal: true }).decode(
  readFileSync(new URL("../app/components/sales.tsx", import.meta.url)),
);
const code = ts.transpileModule(`${source}\nexports.testProgress = progress;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: (name) => name === "react/jsx-runtime" ? {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  } : {},
};
vm.runInNewContext(code, context);
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

test("sales progress preserves above-target results with an accessible meter", () => {
  const result = nodes(context.exports.testProgress(12, 10, 120));
  const meter = result.find((node) => node.type === "meter");
  assert.equal(meter.props.value, 12);
  assert.equal(meter.props.max, 10);
  assert.equal(meter.props["aria-label"], "12 of 10 target achieved");
  assert.equal(result.find((node) => node.type === "small").props.children.join(""), "120% of monthly target");
});

test("sales progress distinguishes unset or zero targets from zero achievement", () => {
  for (const goal of [undefined, 0]) {
    const result = nodes(context.exports.testProgress(3, goal));
    assert.equal(result.some((node) => node.type === "meter"), false);
    assert.equal(result.find((node) => node.type === "small").props.children, "No monthly target set");
  }
  const result = nodes(context.exports.testProgress(0, 10, 0));
  assert.equal(result.find((node) => node.type === "meter").props.value, 0);
});
