import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/employee-credentials-pdf.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const context = {exports:{},require:createRequire(import.meta.url)};
vm.runInNewContext(code, context);
const font = readFileSync(new URL("../public/fonts/Amiri-Regular.ttf", import.meta.url)).toString("base64");
const {createCredentialsPdf} = context.exports;

test("creates readable multipage PDFs with Arabic names and long credentials", () => {
  const credentials = Array.from({length:100}, (_, i) => ({
    name: i === 0 ? "أحمد محمد إبراهيم" : `Demo employee ${i + 1}`,
    email: `employee-${i + 1}@example.com`,
    password: `apple-cloud-river-table-${1000+i}`,
  }));
  credentials[1].name = "Long employee name ".repeat(6);
  credentials[1].email = "very-long-email-".repeat(12) + "@example.com";
  const pdf = createCredentialsPdf(credentials,font,"demo-company","http://localhost:3003");
  const data = Buffer.from(pdf.output("arraybuffer"));
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.equal(data.subarray(0,5).toString(),"%PDF-");
  if (process.env.HR_PDF_TEST_OUTPUT) writeFileSync(process.env.HR_PDF_TEST_OUTPUT,data);
});
