"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ApiError, api, send } from "../../lib/api";
import { auditLabel } from "../../lib/audit-display";
import { Field, Modal } from "./modal";

type Owner = {
  id: string;
  email: string;
  name: string;
  recoveryUsed?: boolean;
};
type CompanyStatus = "provisioning" | "active" | "suspended" | "archived";
type Customer = {
  id: string;
  workspace: string;
  name: string;
  timezone: string;
  status: CompanyStatus;
  setupComplete: boolean;
  adminEmail: string | null;
  invitationExpiresAt: string | null;
  branchLimit: number | null;
  branchCount: number;
};
type Audit = {
  sequence: number;
  actor: string;
  action: string;
  companyId: string | null;
  at: string;
  details: Record<string, string>;
};
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}
export function OwnerFrame({
  title,
  children,
  label = "Owner administration",
}: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <main className="login-page owner-page">
      <header className="login-brand">
        HR Platform <span className="muted">{label}</span>
      </header>
      <section className="login-form owner-card">
        <h1>{title}</h1>
        {children}
      </section>
      <footer>
        <Link href="/">Company sign-in</Link>
      </footer>
    </main>
  );
}
export function OwnerPortal() {
  const [owner, setOwner] = useState<Owner | null>(null),
    [checking, setChecking] = useState(true),
    [companies, setCompanies] = useState<Customer[]>([]),
    [audit, setAudit] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [recovery, setRecovery] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false),
    [action, setAction] = useState<{
      company: Customer;
      status: CompanyStatus | "revoke-invitation";
    } | null>(null);
  const [secretLink, setSecretLink] = useState<{
    path: string;
    expiresAt: string;
  } | null>(null);
  const [branchLimitCompany, setBranchLimitCompany] = useState<Customer | null>(
    null,
  );
  const creation = useRef<{ fingerprint: string; requestId: string } | null>(
      null,
    ),
    invitations = useRef(new Map<string, string>());
  function failure(cause: unknown) {
    setError(message(cause));
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      setOwner(null);
      setCompanies([]);
      setAudit([]);
      setSecretLink(null);
      setCreating(false);
      setAction(null);
      setResetting(false);
    }
  }
  async function refresh() {
    const [list, events] = await Promise.all([
      api<Customer[]>("/owner/companies"),
      api<Audit[]>("/owner/audit"),
    ]);
    setCompanies(list);
    setAudit(events);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const current = await api<Owner>("/owner/me");
        if (!active) return;
        setOwner(current);
        await refresh();
      } catch (cause) {
        if (active && !(cause instanceof ApiError && cause.status === 401))
          setError(message(cause));
      } finally {
        if (active) setChecking(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await send<{ owner: Owner }>("/owner/login", "POST", {
        email: form.get("email"),
        password: form.get("password"),
        ...(recovery
          ? {
              recoveryCode: String(form.get("verification")).replaceAll(
                " ",
                "",
              ),
            }
          : { code: form.get("verification") }),
      });
      setOwner(result.owner);
      setNotice(
        result.owner.recoveryUsed
          ? "A recovery code was consumed. Reset your authenticator below if you lost access to it."
          : "",
      );
      await refresh();
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const fingerprint = JSON.stringify(data);
    if (creation.current?.fingerprint !== fingerprint)
      creation.current = { fingerprint, requestId: crypto.randomUUID() };
    await perform(async () => {
      await send("/owner/companies", "POST", {
        ...data,
        requestId: creation.current!.requestId,
      });
      creation.current = null;
      setCreating(false);
      setNotice("Company created. Generate its administrator invitation next.");
      await refresh();
    });
  }
  async function invite(company: Customer) {
    if (!invitations.current.has(company.id))
      invitations.current.set(company.id, crypto.randomUUID());
    await perform(async () => {
      const link = await send<{ path: string; expiresAt: string }>(
        "/owner/companies/" + company.id + "/invitation",
        "POST",
        { requestId: invitations.current.get(company.id) },
      );
      invitations.current.delete(company.id);
      setSecretLink(link);
      await refresh();
    });
  }
  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason"),
      pending = action!;
    await perform(async () => {
      await send(
        "/owner/companies/" +
          pending.company.id +
          "/" +
          (pending.status === "revoke-invitation"
            ? "revoke-invitation"
            : "status"),
        "POST",
        {
          reason,
          ...(pending.status === "revoke-invitation"
            ? {}
            : {
                status: pending.status,
                expectedStatus: pending.company.status,
              }),
        },
      );
      setAction(null);
      setSecretLink(null);
      setNotice("Company action saved.");
      await refresh();
    });
  }
  if (checking)
    return (
      <OwnerFrame title="Platform owner">
        <p role="status">Checking owner session…</p>
      </OwnerFrame>
    );
  if (!owner)
    return (
      <OwnerFrame title="Owner sign-in">
        <p className="muted">
          Use your separate owner account and authenticator.
        </p>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <form onSubmit={login}>
          <Field label="Owner email">
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              maxLength={254}
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </Field>
          <Field
            label={recovery ? "Single-use recovery code" : "Authenticator code"}
          >
            <input
              key={String(recovery)}
              name="verification"
              required
              autoComplete="one-time-code"
              inputMode={recovery ? "text" : "numeric"}
              pattern={recovery ? "[a-fA-F0-9]{24}" : "[0-9]{6}"}
              maxLength={recovery ? 24 : 6}
            />
          </Field>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => setRecovery(!recovery)}
          >
            {recovery ? "Use authenticator instead" : "Use a recovery code"}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in as owner"}
          </button>
        </form>
      </OwnerFrame>
    );
  return (
    <main className="owner-dashboard">
      <header className="owner-heading">
        <div>
          <h1>Companies</h1>
          <p className="muted">
            {owner.name} · {owner.email}
          </p>
          <p>
            Manage customer access and onboarding. Employee records remain in
            company workspaces.
          </p>
        </div>
        <div className="owner-actions">
          <button
            className="button owner-action-account"
            disabled={busy}
            onClick={() => {
              setError("");
              setRecovery(false);
              setResetting(true);
            }}
          >
            Reset password / authenticator
          </button>
          <button
            className="button owner-action-refresh"
            disabled={busy}
            onClick={() => void perform(refresh)}
          >
            Refresh
          </button>
          <button
            className="button owner-action-signout"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                try {
                  await send("/owner/logout", "POST");
                } finally {
                  setOwner(null);
                  setCompanies([]);
                  setAudit([]);
                  setSecretLink(null);
                }
              })
            }
          >
            Sign out
          </button>
        </div>
      </header>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="message notice" role="status">
          {notice}
        </p>
      )}
      <section className="owner-section">
        <header className="owner-heading">
          <h2>Company registry</h2>
          <button
            className="button owner-action-create"
            disabled={busy}
            onClick={() => {
              setError("");
              setCreating(true);
            }}
          >
            Create company
          </button>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Code</th>
                <th>Timezone</th>
                <th>Status</th>
                <th>Setup</th>
                <th>Branches</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    {company.name}
                    <br />
                    <small>{company.adminEmail}</small>
                  </td>
                  <td>{company.workspace}</td>
                  <td>{company.timezone}</td>
                  <td>{company.status}</td>
                  <td>
                    {company.setupComplete
                      ? "Complete"
                      : "Awaiting administrator"}
                    {company.invitationExpiresAt && (
                      <>
                        <br />
                        <small>
                          Invite expires{" "}
                          {new Date(
                            company.invitationExpiresAt,
                          ).toLocaleString()}
                        </small>
                      </>
                    )}
                  </td>
                  <td>
                    {company.branchCount} / {company.branchLimit ?? "Unlimited"}
                  </td>
                  <td>
                    <div className="owner-actions">
                      <button
                        className="button owner-action-account"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setBranchLimitCompany(company);
                        }}
                      >
                        Branch limit
                      </button>
                      {company.status === "provisioning" &&
                        !company.setupComplete && (
                          <>
                            <button
                              className="button owner-action-refresh"
                              disabled={busy}
                              onClick={() => void invite(company)}
                            >
                              Generate invitation
                            </button>
                            <button
                              className="button owner-action-revoke-invitation"
                              disabled={busy}
                              onClick={() =>
                                setAction({
                                  company,
                                  status: "revoke-invitation",
                                })
                              }
                            >
                              Revoke invitation
                            </button>
                          </>
                        )}
                      {((company.status === "provisioning" &&
                        company.setupComplete) ||
                        company.status === "suspended") && (
                        <button
                          className="button owner-action-active"
                          disabled={busy}
                          onClick={() =>
                            setAction({ company, status: "active" })
                          }
                        >
                          {company.status === "suspended"
                            ? "Reactivate"
                            : "Activate"}
                        </button>
                      )}
                      {company.status === "active" && (
                        <button
                          className="button owner-action-suspended"
                          disabled={busy}
                          onClick={() =>
                            setAction({ company, status: "suspended" })
                          }
                        >
                          Suspend
                        </button>
                      )}
                      {company.status !== "archived" && (
                        <button
                          className="button owner-action-archived"
                          disabled={busy}
                          onClick={() =>
                            setAction({ company, status: "archived" })
                          }
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!companies.length && <p>No companies yet.</p>}
      </section>
      <section className="owner-section">
        <h2>Platform audit</h2>
        <p className="muted">
          Most recent 100 platform events. Employee content is excluded.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Owner</th>
                <th>Action</th>
                <th>Company</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((event) => (
                <tr key={event.sequence}>
                  <td>{new Date(event.at).toLocaleString()}</td>
                  <td>{event.actor}</td>
                  <td>{auditLabel(event.action)}</td>
                  <td>
                    {companies.find((company) => company.id === event.companyId)
                      ?.workspace ?? "Platform"}
                  </td>
                  <td>
                    {Object.entries(event.details)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join("; ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {creating && (
        <Modal
          title="Create company"
          close={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form onSubmit={create}>
            <div className="owner-modal-body">
              <div className="form-grid">
                <Field label="Company name">
                  <input name="name" required maxLength={120} />
                </Field>
                <Field label="Company code">
                  <input
                    name="workspace"
                    required
                    pattern="[a-z0-9][a-z0-9-]{1,62}"
                    maxLength={63}
                  />
                </Field>
                <Field label="Company timezone">
                  <input
                    name="timezone"
                    defaultValue="Africa/Cairo"
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label="Administrator name">
                  <input name="adminName" required maxLength={120} />
                </Field>
                <Field label="Administrator email">
                  <input
                    type="email"
                    name="adminEmail"
                    required
                    maxLength={254}
                  />
                </Field>
              </div>
              <p>
                The company starts in provisioning. Its administrator will
                configure the first branch through a private invitation.
              </p>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Create company"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {branchLimitCompany && (
        <Modal
          title={`Branch limit: ${branchLimitCompany.name}`}
          close={() => {
            if (!busy) setBranchLimitCompany(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const limit = String(form.get("branchLimit") ?? "").trim();
              await perform(async () => {
                await send(
                  `/owner/companies/${branchLimitCompany.id}/branch-limit`,
                  "POST",
                  {
                    branchLimit: limit ? Number(limit) : null,
                    reason: form.get("reason"),
                  },
                );
                await refresh();
                setBranchLimitCompany(null);
                setNotice("Company branch limit saved.");
              });
            }}
          >
            <div className="owner-modal-body">
              <p>
                Counts all branches, including inactive branches. This company
                currently has {branchLimitCompany.branchCount}. Leave blank for
                unlimited branches.
              </p>
              <Field label="Maximum branches">
                <input
                  name="branchLimit"
                  type="number"
                  min={Math.max(1, branchLimitCompany.branchCount)}
                  max={2147483647}
                  step={1}
                  defaultValue={branchLimitCompany.branchLimit ?? ""}
                />
              </Field>
              <Field label="Reason">
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={500}
                  required
                />
              </Field>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save branch limit"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {action && (
        <Modal
          title={`${action.status === "revoke-invitation" ? "Revoke invitation" : action.status === "active" ? "Activate company" : action.status === "suspended" ? "Suspend company" : "Archive company"}: ${action.company.name}`}
          close={() => {
            if (!busy) setAction(null);
          }}
        >
          <form onSubmit={changeStatus}>
            <div className="owner-modal-body">
              <p>
                {action.status === "archived"
                  ? "Archiving disables access and keeps the data. This action cannot be reversed in the owner UI."
                  : action.status === "suspended"
                    ? "Suspension signs company users out and stops company processing. Existing records are retained."
                    : "Review the company and record the reason for this action."}
              </p>
              <Field label="Reason">
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={500}
                  required
                />
              </Field>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Confirm action"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {resetting && (
        <Modal
          title="Verify owner credentials"
          close={() => {
            if (!busy) setResetting(false);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await perform(async () => {
                setSecretLink(
                  await send("/owner/recovery", "POST", {
                    password: form.get("password"),
                    ...(recovery
                      ? { recoveryCode: form.get("verification") }
                      : { code: form.get("verification") }),
                  }),
                );
                setResetting(false);
              });
            }}
          >
            <div className="owner-modal-body">
              <p>
                Verify your password and a fresh authenticator code, or an
                unused recovery code, before replacing credentials.
              </p>
              <Field label="Current owner password">
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                />
              </Field>
              <Field
                label={recovery ? "Unused recovery code" : "Authenticator code"}
              >
                <input
                  key={String(recovery)}
                  name="verification"
                  required
                  pattern={recovery ? "[a-fA-F0-9]{24}" : "[0-9]{6}"}
                  maxLength={recovery ? 24 : 6}
                  autoComplete="one-time-code"
                />
              </Field>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setRecovery(!recovery)}
              >
                {recovery ? "Use authenticator" : "Use recovery code"}
              </button>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button className="button primary" disabled={busy}>
                {busy ? "Verifying…" : "Create private recovery link"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {secretLink && (
        <Modal title="Private setup link" close={() => setSecretLink(null)}>
          <div className="owner-modal-body">
            <p>
              {secretLink.path.startsWith("/owner/setup")
                ? "Open this link privately to replace your owner credentials. Completing setup signs out existing owner sessions."
                : "Share this link privately with the company administrator. No email has been sent. Generating a replacement invitation invalidates the previous one."}
            </p>
            <Field label="Setup URL">
              <input
                readOnly
                value={
                  typeof window === "undefined"
                    ? ""
                    : window.location.origin + secretLink.path
                }
                onFocus={(event) => event.currentTarget.select()}
              />
            </Field>
            <p>
              Expires {new Date(secretLink.expiresAt).toLocaleString()}. Close
              this dialog after sharing.
            </p>
          </div>
          {secretLink.path.startsWith("/owner/setup") && (
            <footer className="modal-footer">
              <a className="button primary" href={secretLink.path}>
                Open owner recovery setup
              </a>
            </footer>
          )}
        </Modal>
      )}
    </main>
  );
}
