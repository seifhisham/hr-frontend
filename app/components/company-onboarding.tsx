"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { send } from "../../lib/api";
import { Field } from "./modal";
import { OwnerFrame } from "./owner-portal";
import { CompanyLocation } from "./company-location";
type Invitation = {
  workspace: string;
  companyName: string;
  timezone: string;
  email: string;
  name: string;
  expiresAt: string;
};
export function CompanyOnboarding() {
  const [token, setToken] = useState(""),
    [invitation, setInvitation] = useState<Invitation | null>(null),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function preview() {
    setBusy(true);
    setError("");
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? token;
    setToken(value);
    try {
      if (!value)
        throw new Error("Open the complete private setup link to continue.");
      window.history.replaceState(null, "", window.location.pathname);
      setInvitation(
        await send("/onboarding/preview", "POST", { token: value }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invitation could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!form.get("latitude") || !form.get("longitude"))
        throw new Error("Choose the branch location on the map before completing setup.");
      await send("/onboarding/accept", "POST", {
        token,
        name: form.get("name"),
        password: form.get("password"),
        branchName: form.get("branchName"),
        policy: {
          address: form.get("address"),
          latitude: Number(form.get("latitude")),
          longitude: Number(form.get("longitude")),
          radiusMeters: Number(form.get("radiusMeters")),
          trackingRadiusMeters: Number(form.get("trackingRadiusMeters")),
          trackingGraceMinutes: Number(form.get("trackingGraceMinutes")),
        },
      });
      setDone(true);
      setToken("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Onboarding could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <OwnerFrame
      label="Company setup"
      title={done ? "Company setup complete" : "Company administrator setup"}
    >
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {done ? (
        <>
          <p>
            Your account and branch are ready. Ask the platform owner to
            activate your company, then sign in with company code{" "}
            <strong>{invitation?.workspace}</strong> and your new password.
          </p>
          <Link href="/" className="button primary">
            Company sign-in
          </Link>
        </>
      ) : invitation ? (
        <>
          <p>
            <strong>{invitation.companyName}</strong> · {invitation.workspace}
          </p>
          <p>
            {invitation.email} · {invitation.timezone}
          </p>
          <form onSubmit={accept}>
            <Field label="Administrator name">
              <input
                name="name"
                defaultValue={invitation.name}
                required
                maxLength={120}
                autoComplete="name"
              />
            </Field>
            <Field label="New password">
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="First branch name">
              <input
                name="branchName"
                defaultValue="Main branch"
                required
                maxLength={120}
              />
            </Field>
            <Field label="Branch address">
              <input name="address" maxLength={500} />
            </Field>
            <CompanyLocation
              onboarding
              company={{ latitude: 30, longitude: 31, radiusMeters: 50, trackingRadiusMeters: 150 }}
            />
            <div className="form-grid">
              <Field label="Return grace (minutes)">
                <input
                  name="trackingGraceMinutes"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={5}
                  required
                />
              </Field>
            </div>
            <p>
              Place the pin at the actual branch entrance on the map. The owner will activate the
              company after setup is complete.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "Completing setup…" : "Complete company setup"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p>
            Open your private invitation to choose a password and configure the
            first branch.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void preview()}
          >
            {busy ? "Checking…" : "Review invitation"}
          </button>
          {!token && (
            <p className="muted">
              A complete, unexpired invitation link is required.
            </p>
          )}
        </>
      )}
    </OwnerFrame>
  );
}
