import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(fetch) {
  const toasts = [];
  const context = { exports: {}, fetch, require: () => ({ notifySave: (toast) => toasts.push(toast) }) };
  vm.runInNewContext(code, context);
  return { api: context.exports, toasts };
}
test("save reports success only after the server responds and returns its result", async () => {
  let respond;
  const result = { id: "employee-1" };
  const { api, toasts } = setup(() => new Promise(resolve => { respond = resolve; }));
  const pending = api.save("/employees", "POST", { name: "Employee" });
  assert.deepEqual(toasts, [null]);
  respond({ ok: true, json: async () => result });
  assert.equal(await pending, result);
  assert.equal(toasts.at(-1).tone, "success");
});
test("save reports server errors and still rejects for the form's error handling", async () => {
  const { api, toasts } = setup(async () => ({ ok: false, status: 400, json: async () => ({ message: "Name is required" }) }));
  await assert.rejects(api.save("/departments", "POST", {}), /Name is required/);
  assert.equal(toasts.at(-1).tone, "error");
  assert.match(toasts.at(-1).message, /Name is required/);
});
test("network failure reports an uncertain save without claiming the data was lost", async () => {
  const { api, toasts } = setup(async () => { throw new Error("offline"); });
  await assert.rejects(api.save("/schedules", "PATCH", {}), /Unable to reach/);
  assert.equal(toasts.at(-1).tone, "error");
  assert.match(toasts.at(-1).message, /Could not confirm/);
});
test("read-only requests do not show save notifications", async () => {
  const { api, toasts } = setup(async () => ({ ok: true, json: async () => [] }));
  await api.api("/employees");
  assert.deepEqual(toasts, []);
});

const toastCode = ts.transpileModule(readFileSync(new URL("../app/components/save-toast.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function toastHarness(connected) {
  const effects = [], updates = [];
  let stateIndex = 0, opened = 0, expire;
  const context = {
    exports: {},
    window: { setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} },
    require: name => name === "react" ? {
      useState: () => [stateIndex++ === 0 ? { tone: "success", message: "Saved" } : {}, value => updates.push(value)],
      useRef: () => ({ current: { isConnected: connected, showPopover() { if (!connected) throw new Error("Disconnected popover"); opened++; } } }),
      useEffect: callback => effects.push(callback),
    } : name === "react-dom" ? { createPortal: element => element } : name === "react/jsx-runtime" ? { jsx: () => null, jsxs: () => null } : {},
  };
  vm.runInNewContext(toastCode, context);
  context.exports.SaveToast();
  return { effects, updates, opened: () => opened, expire: () => expire() };
}
test("toast does not open a disconnected modal element during dialog closure", () => {
  const harness = toastHarness(false);
  assert.doesNotThrow(() => harness.effects[2]());
  assert.equal(harness.opened(), 0);
});
test("connected toast opens and its expiry clears the notification", () => {
  const harness = toastHarness(true);
  harness.effects[2]();
  assert.equal(harness.opened(), 1);
  harness.expire();
  assert.deepEqual(harness.updates, [null]);
});
