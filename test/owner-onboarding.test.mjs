import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
function render(file, states, form, handler = async () => ({}), effects = []) {
  const calls = [],
    history = [];
  let index = 0;
  const code = ts.transpileModule(
    readFileSync(new URL("../app/components/" + file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const jsx = (type, props) => ({ type, props });
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  const context = {
    exports: {},
    Intl,
    Date,
    Map,
    JSON,
    URLSearchParams,
    crypto: { randomUUID },
    FormData: class extends Map {
      constructor() {
        super(Object.entries(form));
      }
    },
    window: {
      location: {
        origin: "https://hr.example",
        pathname: "/owner/setup",
        hash: "#token=" + "a".repeat(43),
      },
      history: { replaceState: (...args) => history.push(args) },
    },
    require: (name) =>
      name === "react"
        ? {
            useState: (initial) => [
              index < states.length ? states[index++] : initial,
              () => {},
            ],
            useRef: (initial) => ({ current: initial }),
            useEffect: (effect) => effects.push(effect),
          }
        : name === "react/jsx-runtime"
          ? { jsx, jsxs: jsx }
          : name === "../../lib/api"
            ? {
                ApiError,
                send: async (...args) => {
                  calls.push(args);
                  return handler(...args);
                },
                api: async () => [],
              }
            : name === "./company-location"
              ? { CompanyLocation: "company-location-picker" }
            : name === "qrcode.react"
              ? { QRCodeSVG: "authenticator-qr" }
              : {},
  };
  vm.runInNewContext(code, context);
  return { components: context.exports, calls, history };
}
function nodes(tree) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    result.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return result;
}
const owner = { id: "owner", name: "Owner", email: "owner@example.test" };
const sessionStates = [
  owner,
  false,
  [],
  [],
  false,
  "",
  "",
  false,
  false,
  false,
  null,
  null,
];
const event = { preventDefault() {}, currentTarget: {} };
const plain = (value) => JSON.parse(JSON.stringify(value));
test("owner sign-in uses its separate REST endpoint and authenticator without a company code", async () => {
  const view = render(
    "owner-portal.tsx",
    [null, false, [], [], false, "", "", false],
    {
      email: owner.email,
      password: "owner-password-123",
      verification: "123456",
    },
    async () => ({ owner }),
  );
  await nodes(view.components.OwnerPortal())
    .find((node) => node.type === "form")
    .props.onSubmit(event);
  assert.equal(view.calls[0][0], "/owner/login");
  assert.deepEqual(plain(view.calls[0][2]), {
    email: owner.email,
    password: "owner-password-123",
    code: "123456",
  });
});
test("a company creation network retry reuses its request ID and preserves administrator details", async () => {
  const states = [...sessionStates];
  states[9] = true;
  let attempts = 0;
  const view = render(
    "owner-portal.tsx",
    states,
    {
      name: "Customer",
      workspace: "customer",
      timezone: "Africa/Cairo",
      adminName: "Admin",
      adminEmail: "admin@example.test",
    },
    async () => {
      if (++attempts === 1) throw new Error("Network interrupted");
      return { id: "new-company" };
    },
  );
  const form = nodes(view.components.OwnerPortal()).find(
    (node) => node.type === "form",
  );
  await form.props.onSubmit(event);
  await form.props.onSubmit(event);
  assert.equal(view.calls[0][2].requestId, view.calls[1][2].requestId);
  assert.equal(view.calls[1][2].adminEmail, "admin@example.test");
  assert.equal(view.calls[1][2].workspace, "customer");
});
test("owner status confirmation sends the reviewed previous status and audit reason", async () => {
  const states = [...sessionStates];
  states[10] = {
    company: { id: "customer", name: "Customer", status: "active" },
    status: "suspended",
  };
  const view = render("owner-portal.tsx", states, {
    reason: "Contract paused by owner",
  });
  await nodes(view.components.OwnerPortal())
    .find((node) => node.type === "form")
    .props.onSubmit(event);
  assert.equal(view.calls[0][0], "/owner/companies/customer/status");
  assert.deepEqual(plain(view.calls[0][2]), {
    reason: "Contract paused by owner",
    status: "suspended",
    expectedStatus: "active",
  });
});
test("owner credential recovery requires reauthentication fields", async () => {
  const states = [...sessionStates];
  states[8] = true;
  const view = render(
    "owner-portal.tsx",
    states,
    { password: "current-owner-password", verification: "123456" },
    async () => ({
      path: "/owner/setup#token=private",
      expiresAt: "2026-10-15T12:00:00Z",
    }),
  );
  const tree = nodes(view.components.OwnerPortal());
  assert.ok(
    tree.some(
      (node) =>
        node.type === "input" &&
        node.props.name === "password" &&
        node.props.required,
    ),
  );
  await tree.find((node) => node.type === "form").props.onSubmit(event);
  assert.equal(view.calls[0][0], "/owner/recovery");
  assert.deepEqual(plain(view.calls[0][2]), {
    password: "current-owner-password",
    code: "123456",
  });
});
test("setup reads the private fragment on interaction, removes it from history and sends it only in a POST body", async () => {
  const view = render(
    "owner-setup.tsx",
    ["", null, null, "", false],
    {},
    async () => ({ email: owner.email, name: "Owner", secret: "SECRET" }),
  );
  await nodes(view.components.OwnerSetup())
    .find((node) => node.type === "button")
    .props.onClick();
  assert.equal(view.calls[0][0], "/owner/setup/prepare");
  assert.equal(view.calls[0][1], "POST");
  assert.equal(view.calls[0][2].token, "a".repeat(43));
  assert.deepEqual(plain(view.history), [[null, "", "/owner/setup"]]);
});
test("authenticator QR uses the server URI locally, preserves manual setup and disappears after enrollment", () => {
  const setup = {
    email: owner.email,
    name: "Owner",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    authenticatorUri:
      "otpauth://totp/HR%20Platform%3Aowner%40example.test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=HR%20Platform&algorithm=SHA1&digits=6&period=30",
  };
  const view = render("owner-setup.tsx", ["token", setup, null, "", false], {});
  const tree = nodes(view.components.OwnerSetup());
  assert.equal(
    tree.find((node) => node.type === "input" && node.props.name === "password")
      .props.minLength,
    8,
  );
  const qr = tree.find((node) => node.type === "authenticator-qr");
  assert.equal(qr.props.value, setup.authenticatorUri);
  assert.equal(qr.props.marginSize, 4);
  assert.ok(qr.props.title);
  assert.ok(
    tree.some(
      (node) => node.type === "pre" && node.props.children === setup.secret,
    ),
  );
  assert.equal(view.calls.length, 0);
  const completed = render(
    "owner-setup.tsx",
    ["", null, ["recovery-code"], "", false],
    {},
  );
  assert.ok(
    !nodes(completed.components.OwnerSetup()).some(
      (node) => node.type === "authenticator-qr",
    ),
  );
});
test("administrator invitation acceptance submits numeric branch policy through REST with no chosen company or role", async () => {
  const invitation = {
    workspace: "customer",
    companyName: "Customer",
    email: "admin@example.test",
    name: "Admin",
    timezone: "Africa/Cairo",
  };
  const view = render(
    "company-onboarding.tsx",
    ["a".repeat(43), invitation, false, false, ""],
    {
      name: "Admin",
      password: "new-admin-password",
      branchName: "Office",
      address: "Address",
      latitude: "30",
      longitude: "31",
      radiusMeters: "50",
      trackingRadiusMeters: "150",
      trackingGraceMinutes: "5",
    },
  );
  const tree = nodes(view.components.CompanyOnboarding());
  assert.equal(
    tree.find(
      (node) => node.type === "input" && node.props.name === "password",
    ).props.minLength,
    8,
  );
  assert.equal(tree.find(node => node.type === "company-location-picker").props.onboarding, true);
  assert.equal(tree.some(node => node.type === "input" && ["latitude", "longitude"].includes(node.props.name)), false);
  await tree.find((node) => node.type === "form")
    .props.onSubmit(event);
  assert.equal(view.calls[0][0], "/onboarding/accept");
  assert.deepEqual(plain(view.calls[0][2].policy), {
    address: "Address",
    latitude: 30,
    longitude: 31,
    radiusMeters: 50,
    trackingRadiusMeters: 150,
    trackingGraceMinutes: 5,
  });
  assert.equal(view.calls[0][2].companyId, undefined);
  assert.equal(view.calls[0][2].role, undefined);
});


test("owner branch limit form sends a number or unlimited through REST", async () => {
  for (const value of ["3", ""]) {
    const company = { id: "company-id", name: "Customer", branchCount: 1, branchLimit: null };
    const view = render("owner-portal.tsx", [...sessionStates, company], { branchLimit: value, reason: "Reviewed customer allowance" });
    const form = nodes(view.components.OwnerPortal()).find((node) => node.type === "form");
    await form.props.onSubmit(event);
    assert.equal(view.calls[0][0], "/owner/companies/company-id/branch-limit");
    assert.deepEqual(plain(view.calls[0][2]), { branchLimit: value ? 3 : null, reason: "Reviewed customer allowance" });
  }
});


test("company setup refuses submission until a branch pin is selected", async () => {
  for (const coordinates of [{}, { latitude: "", longitude: "" }]) {
    const view = render("company-onboarding.tsx", ["token", {companyName:"Customer",workspace:"customer"}, false, false, ""], {
      name: "Admin", password: "new-admin-password", branchName: "Office", ...coordinates,
    });
    const tree = nodes(view.components.CompanyOnboarding());
    await tree.find(node => node.type === "form").props.onSubmit(event);
    assert.equal(view.calls.length, 0, "No onboarding API call without an explicitly selected pin");
  }
});
