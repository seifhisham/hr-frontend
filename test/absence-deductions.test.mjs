import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compile = (file) =>
  ts.transpileModule(
    readFileSync(new URL(`../app/components/${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
const pagerCode = compile("pager.tsx");
const jsx = (type, props) => ({ type, props });
function loadPager() {
  const exports = {};
  vm.runInNewContext(pagerCode, {
    exports,
    require: (name) => (name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {}),
  });
  return exports;
}
function render(file, name, state, props, apiModule = {}) {
  const changes = new Map();
  let index = 0;
  const context = {
    exports: {},
    Intl,
    Set,
    require: (module) =>
      module === "react"
        ? {
            useState: (initial) => {
              const key = index++;
              return [
                key in state ? state[key] : initial,
                (value) => changes.set(key, value),
              ];
            },
            useEffect() {},
          }
        : module === "react/jsx-runtime"
          ? { jsx, jsxs: jsx, Fragment: "fragment" }
          : module === "./pager"
            ? loadPager()
            : module === "../../lib/api"
              ? apiModule
              : module === "./modal"
                ? { Badge: "Badge", Field: "Field", Modal: "Modal" }
                : { Plus: "Plus", Trash2: "Trash2", Pencil: "Pencil", CheckCircle2: "Check" },
  };
  vm.runInNewContext(compile(file), context);
  const tree = context.exports[name](props);
  const nodes = [];
  const text = [];
  (function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node === "string" || typeof node === "number")
      return void text.push(String(node));
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  })(tree);
  return { nodes, changes, text: text.join(" ").replace(/\s+/g, " ") };
}

const absence = {
  enabled: false,
  daysPerAbsence: 1,
  effectiveFrom: null,
  excludedDates: ["2026-11-20"],
};
const policy = {
  requests: Object.fromEntries(
    ["leave", "holiday", "sick", "unpaid", "urgent", "mission", "excuse", "forgotten-check-out"].map(
      (type) => [type, { approved: 1, rejected: 3 }],
    ),
  ),
  lateArrival: { enabled: false, freeLatesPerMonth: 0, exemptApprovedRequests: true, tiers: [] },
  absence,
  updatedAt: null,
  updatedBy: null,
};
const settings = (changes = {}) => {
  const rules = { ...policy, absence: { ...absence, ...changes } };
  return render("deduction-rules.tsx", "DeductionRules", { 0: policy, 1: rules, 5: "" }, {
    timezone: "Africa/Cairo",
    onError() {},
  });
};
const field = (nodes, label) =>
  nodes.find((node) => node.type === "Field" && node.props.label === label);

test("settings explain the per-employee start and that the date only moves it later", () => {
  const { text } = settings();
  assert.match(text, /starts from their own first check-in/);
  assert.match(text, /can only move an employee.s start later/);
  assert.match(text, /Never checked in/);
});
test("settings save an empty start date as null and toggle the rule", () => {
  const { nodes, changes } = settings({ effectiveFrom: "2026-11-01" });
  const input = field(nodes, "Count absences from (optional)").props.children;
  assert.equal(input.props.value, "2026-11-01");
  input.props.onChange({ target: { value: "" } });
  assert.equal(changes.get(1).absence.effectiveFrom, null);
  const toggle = nodes.find(
    (node) => node.type === "input" && node.props.type === "checkbox" && node.props.checked === false &&
      node.props.onChange.toString().includes("setAbsence"),
  );
  toggle.props.onChange({ target: { checked: true } });
  assert.equal(changes.get(1).absence.enabled, true);
});
test("settings add sorted unique closure dates and remove them", () => {
  const added = render(
    "deduction-rules.tsx",
    "DeductionRules",
    { 0: policy, 1: policy, 5: "2026-11-05" },
    { timezone: "Africa/Cairo", onError() {} },
  );
  added.nodes
    .find((node) => node.type === "button" && node.props.className === "button secondary" && !node.props.disabled &&
      node.props.onClick.toString().includes("closureDate"))
    .props.onClick();
  assert.deepEqual([...added.changes.get(1).absence.excludedDates], ["2026-11-05", "2026-11-20"]);
  const { nodes, changes } = settings();
  nodes.find((node) => node.props?.["aria-label"] === "Remove 2026-11-20").props.onClick();
  assert.deepEqual([...changes.get(1).absence.excludedDates], []);
});

const item = (changes) => ({
  source: "absence",
  id: "e1:2026-11-03",
  employeeId: "e1",
  employeeName: "Sara Ali",
  employeeNumber: "EMP-000001",
  department: "Sales",
  date: "2026-11-03",
  workDate: "2026-11-03",
  detail: "Absent, no check-in or request",
  automaticDays: 1,
  days: 1,
  adjustment: null,
  locked: false,
  absenceStatus: "absent",
  editable: true,
  ...changes,
});
const review = (rows, neverRows = []) => {
  const key = "2026-11:0:0";
  return render(
    "automatic-deductions.tsx",
    "AutomaticDeductions",
    { 0: "2026-11", 1: 0, 2: { key, rows }, 3: { key, rows: neverRows } },
    { today: "2026-11-23", timezone: "Africa/Cairo", revision: 0, onError() {} },
  );
};
const action = (nodes, verb, name) =>
  nodes.find((node) => node.props?.["aria-label"] === `${verb} deduction for ${name}`);

test("review lists an absence with date, reason and days and allows editing", () => {
  const { nodes, text, changes } = review([item()]);
  assert.match(text, /Sara Ali/);
  assert.match(text, /Absent, no check-in or request/);
  assert.match(text, /Nov 3, 2026/);
  assert.match(text, /1 day/);
  const edit = action(nodes, "Edit", "Sara Ali");
  assert.equal(edit.props.disabled, false);
  edit.props.onClick();
  assert.equal(changes.get(4).item.id, "e1:2026-11-03");
  assert.equal(action(nodes, "Remove", "Sara Ali").props.disabled, false);
});
test("review shows held days and blocks editing covered or locked days", () => {
  const held = review([
    item({
      absenceStatus: "held",
      detail: "Held for review, sick request pending",
      automaticDays: 0,
      days: 0,
      editable: false,
    }),
  ]);
  assert.match(held.text, /Held for review/);
  assert.ok(held.nodes.some((node) => node.type === "Badge" && node.props.value === "held for review"));
  assert.equal(action(held.nodes, "Edit", "Sara Ali").props.disabled, true);
  assert.equal(action(review([item({ locked: true })]).nodes, "Edit", "Sara Ali").props.disabled, true);
});
test("the Never checked in list shows name, branch and start date", () => {
  const { text } = review([], [
    {
      employeeId: "e2",
      employeeName: "Omar Said",
      employeeNumber: "EMP-000002",
      department: "Ops",
      branchName: "Cairo",
      startDate: "2026-03-01",
    },
  ]);
  assert.match(text, /Never checked in/);
  assert.match(text, /Omar Said/);
  assert.match(text, /Cairo/);
  assert.match(text, /Mar 1, 2026/);
  assert.match(text, /payroll is not affected/);
});
test("the Never checked in list has a clear empty state", () => {
  assert.match(review([]).text, /has checked in at least once/);
});
test("payroll and history show absences and tolerate old runs without them", () => {
  const payroll = readFileSync(new URL("../app/components/payroll.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/components/employee-profile.tsx", import.meta.url), "utf8");
  assert.match(payroll, /row\.absenceDeductions\?\.length \?\? 0/);
  assert.match(payroll, /function AbsenceDetail/);
  assert.match(profile, /row\.absenceDeductions\?\.map/);
});
