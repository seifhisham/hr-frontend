import ExcelJS from "exceljs";
import type { BankDetails, EmployeeBankDetails, PayrollRun } from "./api";

export const BANK_HEADERS = [
  "Transaction Type Code",
  "Debit Account No.",
  "Beneficiary Account No.",
  "Beneficiary Name",
  "Beneficiary Bank Swift Code / IFSC Code",
  "Purpose Code",
  "Value Date",
  "Transaction Currency",
  "Payment Amount",
  "Payment Type",
  "Customer Reference No",
  "Purpose Of Payment",
];
export type BankBeneficiary = Omit<EmployeeBankDetails, "employeeId">;
export type BankTemplate = {
  settings: BankDetails["settings"];
  beneficiaries: BankBeneficiary[];
};
const nameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export async function readBankTemplate(
  buffer: ArrayBuffer,
): Promise<BankTemplate> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets.find((sheet) =>
    BANK_HEADERS.every(
      (header, index) =>
        sheet
          .getRow(1)
          .getCell(index + 1)
          .text.trim() === header,
    ),
  );
  if (!sheet)
    throw new Error("Select the bank workbook with the expected 12 columns.");
  if (sheet.rowCount > 10000)
    throw new Error("Bank templates may contain at most 10,000 rows.");
  const settings: BankDetails["settings"] = {
    debitAccount: "",
    transactionTypeCode: "",
    purposeCode: "",
    paymentType: "",
    purposeOfPayment: "",
  };
  const shared: [keyof BankDetails["settings"], number][] = [
    ["debitAccount", 2],
    ["transactionTypeCode", 1],
    ["purposeCode", 6],
    ["paymentType", 10],
    ["purposeOfPayment", 12],
  ];
  const beneficiaries: BankBeneficiary[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const beneficiaryName = row.getCell(4).text.trim();
    if (!beneficiaryName) continue;
    const text = (column: number) => {
      const cell = row.getCell(column);
      if (
        cell.formula ||
        (typeof cell.value === "number" && !Number.isSafeInteger(cell.value))
      )
        throw new Error(
          "Bank details must be text or whole account numbers, not formulas.",
        );
      return cell.text.trim();
    };
    for (const [key, column] of shared) {
      const value = text(column);
      if (settings[key] && value && settings[key] !== value)
        throw new Error(
          "The import must use one debit account and one set of transfer codes. Edit these in Bank details.",
        );
      if (value) settings[key] = value;
    }
    beneficiaries.push({ beneficiaryName, account: text(3), swift: text(5) });
  }
  if (!beneficiaries.length)
    throw new Error("The bank workbook has no named beneficiaries.");
  return { settings, beneficiaries };
}

export function matchBankBeneficiaries(
  rows: PayrollRun["rows"],
  saved: EmployeeBankDetails[],
  beneficiaries: BankBeneficiary[],
): string[] {
  const names = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const name of [
      row.name,
      saved.find((entry) => entry.employeeId === row.employeeId)
        ?.beneficiaryName ?? "",
    ]) {
      const key = nameKey(name);
      if (!key) continue;
      const ids = names.get(key) ?? new Set<string>();
      ids.add(row.employeeId);
      names.set(key, ids);
    }
  }
  const matches = beneficiaries.map((beneficiary) => {
    const ids = names.get(nameKey(beneficiary.beneficiaryName));
    return ids?.size === 1 ? [...ids][0] : "";
  });
  return matches.map((id) =>
    id && matches.filter((match) => match === id).length === 1 ? id : "",
  );
}

export async function createBankWorkbook(
  run: PayrollRun,
  details: BankDetails,
  valueDate: string,
) {
  const date = new Date(`${valueDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(valueDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== valueDate
  )
    throw new Error("Choose a valid payment date.");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Template");
  const widths = [
    21.43, 21.43, 21.29, 24.71, 33.71, 21.29, 21.29, 21.29, 21.29, 21.29, 21.29,
    21.29,
  ];
  sheet.columns = BANK_HEADERS.map((header, index) => ({
    header,
    width: widths[index],
  }));
  sheet.getRow(1).font = { name: "Calibri", size: 11, bold: true };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  const issues: string[] = [];
  for (const employee of run.rows) {
    const bank = details.employees.find(
      (entry) => entry.employeeId === employee.employeeId,
    );
    const settings = details.settings;
    const amount =
      employee.netSalary !== null && employee.netSalary >= 0
        ? employee.netSalary
        : null;
    const row = sheet.addRow([
      settings.transactionTypeCode,
      settings.debitAccount || null,
      bank?.account || null,
      bank?.beneficiaryName || employee.name,
      bank?.swift || null,
      settings.purposeCode,
      date,
      employee.currency,
      amount,
      settings.paymentType,
      employee.employeeNumber,
      settings.purposeOfPayment,
    ]);
    row.font = { name: "Calibri", size: 11 };
    for (const column of [2, 3, 6, 11]) row.getCell(column).numFmt = "@";
    row.getCell(7).numFmt = "dd/mm/yyyy";
    row.getCell(9).numFmt = "0.00";
    const missing = [1, 2, 3, 4, 5, 6, 10, 12].filter(
      (column) => !row.getCell(column).value,
    );
    if (amount === null) missing.push(9);
    for (const column of missing)
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFE699" },
      };
    if (missing.length)
      issues.push(
        `${employee.name}: ${missing.map((column) => BANK_HEADERS[column - 1]).join(", ")}${employee.netSalary !== null && employee.netSalary < 0 ? " (negative net salary; payment left blank)" : ""}`,
      );
  }
  return { buffer: new Uint8Array(await wb.xlsx.writeBuffer()), issues };
}
