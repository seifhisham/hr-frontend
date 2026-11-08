import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import ExcelJS from "exceljs";

const source = readFileSync(
  new URL("../lib/bank-payroll.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const exports = {};
new Function("require", "exports", code)(
  createRequire(import.meta.url),
  exports,
);
const {
  BANK_HEADERS,
  readBankTemplate,
  matchBankBeneficiaries,
  createBankWorkbook,
} = exports;
const settings = {
  debitAccount: "0012345678901",
  transactionTypeCode: "BT",
  purposeCode: "13",
  paymentType: "SALARY",
  purposeOfPayment: "SALARY",
};
const rows = [
  {
    employeeId: "one",
    employeeNumber: "EMP-000001",
    name: "Ahmed Ali",
    netSalary: 1234.56,
    currency: "EGP",
  },
  {
    employeeId: "two",
    employeeNumber: "EMP-000002",
    name: "أحمد محمد",
    netSalary: null,
    currency: "USD",
  },
];

test("imports the bank layout, retains account zeros, and matches only unique names", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Template");
  sheet.addRow(BANK_HEADERS);
  sheet.addRow([
    "BT",
    settings.debitAccount,
    "0000987654321",
    " AHMED   ALI ",
    "ARABEGXXXX",
    "13",
    new Date(),
    "EGP",
    999,
    "SALARY",
    "old-reference",
    "SALARY",
  ]);
  const template = await readBankTemplate(await wb.xlsx.writeBuffer());
  assert.equal(template.settings.debitAccount, settings.debitAccount);
  assert.equal(template.beneficiaries[0].account, "0000987654321");
  assert.deepEqual(
    Array.from(matchBankBeneficiaries(rows, [], template.beneficiaries)),
    ["one"],
  );
  assert.deepEqual(
    Array.from(
      matchBankBeneficiaries(
        [...rows, { ...rows[0], employeeId: "duplicate" }],
        [],
        template.beneficiaries,
      ),
    ),
    [""],
  );
  assert.deepEqual(
    Array.from(
      matchBankBeneficiaries(
        rows,
        [],
        [...template.beneficiaries, ...template.beneficiaries],
      ),
    ),
    ["", ""],
  );
});

test("exports editable bank columns with net pay, current date, blanks for missing data, and no old beneficiaries", async () => {
  const result = await createBankWorkbook(
    { rows, month: "2026-11" },
    {
      settings,
      employees: [
        {
          employeeId: "one",
          beneficiaryName: "Ahmed Ali",
          account: "0000987654321",
          swift: "ARABEGXXXX",
        },
        { employeeId: "stale", account: "old-account" },
      ],
    },
    "2026-11-30",
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(result.buffer);
  const sheet = wb.getWorksheet("Template");
  assert.equal(wb.worksheets.length, 1);
  assert.deepEqual(sheet.getRow(1).values.slice(1), Array.from(BANK_HEADERS));
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell("B2").value, "0012345678901");
  assert.equal(sheet.getCell("C2").value, "0000987654321");
  assert.equal(sheet.getCell("I2").value, 1234.56);
  assert.equal(
    sheet.getCell("G2").value.toISOString().slice(0, 10),
    "2026-11-30",
  );
  assert.equal(sheet.getCell("D3").value, "أحمد محمد");
  assert.equal(sheet.getCell("H3").value, "USD");
  assert.equal(sheet.getCell("I3").value, null);
  assert.equal(sheet.getCell("C3").value, null);
  assert.ok(result.issues.some((issue) => issue.includes("أحمد محمد")));
  assert.ok(!sheet.sheetProtection?.sheet);
  sheet.getCell("I2").value = 1500;
  const edited = new ExcelJS.Workbook();
  await edited.xlsx.load(await wb.xlsx.writeBuffer());
  assert.equal(edited.getWorksheet("Template").getCell("I2").value, 1500);
});

test("rejects invalid dates and layouts; never exports negative pay or text as formulas", async () => {
  await assert.rejects(
    createBankWorkbook({ rows }, { settings, employees: [] }, "2026-02-30"),
    /date/i,
  );
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Wrong").addRow(["Not the bank template"]);
  await assert.rejects(
    readBankTemplate(await wb.xlsx.writeBuffer()),
    /columns/i,
  );
  const result = await createBankWorkbook(
    { rows: [{ ...rows[0], name: "=1+1", netSalary: -100 }] },
    { settings, employees: [] },
    "2026-11-30",
  );
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(result.buffer);
  assert.equal(output.worksheets[0].getCell("D2").value, "=1+1");
  assert.equal(output.worksheets[0].getCell("I2").value, null);
  assert.ok(result.issues.some((issue) => issue.includes("negative")));
});

test(
  "imports the provided bank workbook without retaining its old dates or empty amounts",
  { skip: !process.env.HR_BANK_TEMPLATE_TEST_PATH },
  async () => {
    const template = await readBankTemplate(
      readFileSync(process.env.HR_BANK_TEMPLATE_TEST_PATH),
    );
    assert.equal(template.beneficiaries.length, 16);
    assert.ok(
      template.beneficiaries.every((row) => row.account && row.beneficiaryName),
    );
    const sampleRows = template.beneficiaries.map((beneficiary, index) => ({
      employeeId: `sample-${index}`,
      employeeNumber: `EMP-${String(index + 1).padStart(6, "0")}`,
      name: beneficiary.beneficiaryName,
      netSalary: 1000 + index,
      currency: "EGP",
    }));
    const result = await createBankWorkbook(
      { month: "2026-11", rows: sampleRows },
      {
        settings: template.settings,
        employees: template.beneficiaries.map((beneficiary, index) => ({
          ...beneficiary,
          employeeId: sampleRows[index].employeeId,
        })),
      },
      "2026-11-30",
    );
    assert.equal(result.issues.length, 0);
    if (process.env.HR_BANK_TEST_OUTPUT)
      writeFileSync(process.env.HR_BANK_TEST_OUTPUT, result.buffer);
  },
);
