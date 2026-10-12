import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;

test("reports follow request cursors and include every page", async () => {
  const calls = [];
  const context = {
    exports: {},
    URLSearchParams,
    fetch: async (path) => {
      calls.push(path);
      const before = new URLSearchParams(path.split("?")[1]).get("before");
      const start = before ? 100 : 0;
      return {
        ok: true,
        json: async () =>
          Array.from({ length: before ? 7 : 100 }, (_, i) => ({
            id: `request-${start + i}`,
          })),
      };
    },
  };
  vm.runInNewContext(code, context);
  const rows = await context.exports.allRequests();
  assert.equal(rows.length, 107);
  assert.equal(new Set(rows.map((row) => row.id)).size, 107);
  assert.equal(calls.length, 2);
  assert.equal(
    new URLSearchParams(calls[1].split("?")[1]).get("before"),
    "request-99",
  );
});

test("reports fail instead of returning partial totals when a page fails", async () => {
  let calls = 0;
  const context = {
    exports: {},
    URLSearchParams,
    fetch: async () =>
      ++calls === 1
        ? {
            ok: true,
            json: async () =>
              Array.from({ length: 100 }, (_, i) => ({ id: `request-${i}` })),
          }
        : {
            ok: false,
            status: 500,
            json: async () => ({ message: "Unavailable" }),
          },
  };
  vm.runInNewContext(code, context);
  await assert.rejects(context.exports.allRequests(), /Unavailable/);
});
