"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { send } from "../../lib/api";
import { Field } from "./modal";
import { OwnerFrame } from "./owner-portal";
export function OwnerSetup() {
  const [token, setToken] = useState(""),
    [setup, setSetup] = useState<{
      email: string;
      name: string;
      secret: string;
      authenticatorUri: string;
    } | null>(null),
    [codes, setCodes] = useState<string[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function prepare() {
    setBusy(true);
    setError("");
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? token;
    setToken(value);
    try {
      if (!value)
        throw new Error("Open the complete private setup link to continue.");
      window.history.replaceState(null, "", window.location.pathname);
      setSetup(await send("/owner/setup/prepare", "POST", { token: value }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Setup could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await send<{ recoveryCodes: string[] }>(
        "/owner/setup/complete",
        "POST",
        {
          token,
          name: form.get("name"),
          password: form.get("password"),
          code: form.get("code"),
        },
      );
      setCodes(result.recoveryCodes);
      setSetup(null);
      setToken("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Setup could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <OwnerFrame title={codes ? "Save recovery codes" : "Set up platform owner"}>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {codes ? (
        <>
          <p>
            Store these single-use codes privately. They replace an
            authenticator code when you lose access. They will not be shown
            again.
          </p>
          <pre className="owner-secret">{codes.join("\n")}</pre>
          <p>Wait for the next authenticator code before signing in.</p>
          <Link className="button primary" href="/owner">
            I saved the recovery codes — sign in
          </Link>
        </>
      ) : setup ? (
        <>
          <p>{setup.email}</p>
          <p>
            In your authenticator, choose Add account and scan this QR code.
          </p>
          <QRCodeSVG
            value={setup.authenticatorUri}
            size={224}
            marginSize={4}
            level="M"
            title="Scan to add your HR Platform authenticator account"
            style={{ maxWidth: "100%", height: "auto" }}
          />
          <p>
            Or enter this setup key manually for a time-based account named HR
            Platform:
          </p>
          <pre className="owner-secret">{setup.secret}</pre>
          <form onSubmit={submit}>
            <Field label="Your name">
              <input
                name="name"
                defaultValue={setup.name}
                required
                maxLength={120}
                autoComplete="name"
              />
            </Field>
            <Field label="New owner password">
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Authenticator code">
              <input
                name="code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Complete owner setup"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p>
            Use the private setup link supplied by the server operator. You will
            choose a password and enroll an authenticator.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void prepare()}
          >
            {busy ? "Preparing…" : "Begin secure setup"}
          </button>
          {!token && (
            <p className="muted">
              Open the complete setup link to continue. Setup links expire and
              are single-use.
            </p>
          )}
        </>
      )}
    </OwnerFrame>
  );
}
