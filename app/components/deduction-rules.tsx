"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  api,
  save,
  type DeductionPolicy,
  type DeductionPolicyRules,
  type RequestRuleType,
} from "../../lib/api";
import { Field } from "./modal";

const requestLabels: [RequestRuleType, string][] = [
  ["leave", "Leave"],
  ["holiday", "Holiday"],
  ["sick", "Sick"],
  ["unpaid", "Unpaid"],
  ["urgent", "Urgent"],
  ["mission", "Mission"],
  ["excuse", "Excuse"],
  ["forgotten-check-out", "Forgotten check-out"],
];

const editable = (policy: DeductionPolicy): DeductionPolicyRules => ({
  requests: policy.requests,
  lateArrival: policy.lateArrival,
});

function DaysInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      min={0}
      max={30}
      step={0.25}
      required
      value={Number.isNaN(value) ? "" : value}
      onChange={(event) => onChange(event.target.valueAsNumber)}
    />
  );
}

export function DeductionRules({
  timezone,
  onError,
}: {
  timezone: string;
  onError: (error: unknown) => void;
}) {
  const [policy, setPolicy] = useState<DeductionPolicy | null>(null);
  const [rules, setRules] = useState<DeductionPolicyRules | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<DeductionPolicy>("/deduction-policy")
      .then((loaded) => {
        if (!alive) return;
        setPolicy(loaded);
        setRules(editable(loaded));
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [onError]);
  if (!rules || !policy) return <p className="muted">Loading deduction rules...</p>;
  const late = rules.lateArrival;
  const setLate = (changes: Partial<DeductionPolicyRules["lateArrival"]>) =>
    setRules({ ...rules, lateArrival: { ...late, ...changes } });
  const setRequest = (
    type: RequestRuleType,
    decision: "approved" | "rejected",
    days: number,
  ) =>
    setRules({
      ...rules,
      requests: {
        ...rules.requests,
        [type]: { ...rules.requests[type], [decision]: days },
      },
    });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await save<DeductionPolicy>("/deduction-policy", "PUT", {
        rules,
        reason,
      });
      setPolicy(saved);
      setRules(editable(saved));
      setReason("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save rules",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-section deduction-rules">
      <h2>Salary deduction rules</h2>
      <p className="muted">
        Deductions are counted in salary days (daily rate = salary ÷ 30), in
        steps of 0.25 day. Administrator accounts are always exempt.
        {policy.updatedAt
          ? ` Last changed by ${policy.updatedBy} on ${new Intl.DateTimeFormat(
              "en",
              { timeZone: timezone, dateStyle: "medium", timeStyle: "short" },
            ).format(new Date(policy.updatedAt))}.`
          : " These are the original default rules."}
      </p>
      <form onSubmit={submit}>
        <fieldset>
          <legend>Employee requests</legend>
          <p className="muted">
            Applied when HR makes the final decision. Requests already decided
            keep the days they were given.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request type</th>
                  <th>Days if approved</th>
                  <th>Days if rejected</th>
                </tr>
              </thead>
              <tbody>
                {requestLabels.map(([type, label]) => (
                  <tr key={type}>
                    <td>{label}</td>
                    <td>
                      <DaysInput
                        label={`${label} approved`}
                        value={rules.requests[type].approved}
                        onChange={(days) => setRequest(type, "approved", days)}
                      />
                    </td>
                    <td>
                      <DaysInput
                        label={`${label} rejected`}
                        value={rules.requests[type].rejected}
                        onChange={(days) => setRequest(type, "rejected", days)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        <fieldset>
          <legend>Late arrival</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={late.enabled}
              onChange={(event) => setLate({ enabled: event.target.checked })}
            />
            Deduct salary for late arrivals
          </label>
          <p className="muted">
            Lateness is measured from the shift start plus its grace period.
            An approved &ldquo;arriving late&rdquo; excuse adds its minutes, so
            arriving within the excuse is never marked late or deducted.
            Applies to draft payroll; approved payroll months stay locked.
          </p>
          {late.enabled && (
            <>
              <Field label="Free late arrivals per month">
                <input
                  type="number"
                  min={0}
                  max={31}
                  step={1}
                  required
                  value={
                    Number.isNaN(late.freeLatesPerMonth)
                      ? ""
                      : late.freeLatesPerMonth
                  }
                  onChange={(event) =>
                    setLate({ freeLatesPerMonth: event.target.valueAsNumber })
                  }
                />
              </Field>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={late.exemptApprovedRequests}
                  onChange={(event) =>
                    setLate({ exemptApprovedRequests: event.target.checked })
                  }
                />
                No late deduction on days covered by an approved leave,
                holiday, sick, unpaid, urgent or mission request
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Late by at least (minutes)</th>
                      <th>Days deducted</th>
                      <th>
                        Remove
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {late.tiers.map((tier, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="number"
                            aria-label={`Tier ${index + 1} minutes`}
                            min={1}
                            max={1440}
                            step={1}
                            required
                            value={
                              Number.isNaN(tier.fromMinutes)
                                ? ""
                                : tier.fromMinutes
                            }
                            onChange={(event) =>
                              setLate({
                                tiers: late.tiers.map((t, i) =>
                                  i === index
                                    ? {
                                        ...t,
                                        fromMinutes:
                                          event.target.valueAsNumber,
                                      }
                                    : t,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <DaysInput
                            label={`Tier ${index + 1} days`}
                            value={tier.days}
                            onChange={(days) =>
                              setLate({
                                tiers: late.tiers.map((t, i) =>
                                  i === index ? { ...t, days } : t,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove tier ${index + 1}`}
                            title="Remove tier"
                            disabled={late.tiers.length === 1}
                            onClick={() =>
                              setLate({
                                tiers: late.tiers.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={late.tiers.length >= 10}
                onClick={() =>
                  setLate({
                    tiers: [
                      ...late.tiers,
                      {
                        fromMinutes:
                          Math.max(0, ...late.tiers.map((t) => t.fromMinutes)) +
                          30,
                        days: 0.5,
                      },
                    ],
                  })
                }
              >
                <Plus size={16} aria-hidden="true" />
                Add tier
              </button>
              <p className="muted">
                Each late arrival uses the highest tier it reaches.
              </p>
            </>
          )}
        </fieldset>
        <Field label="Reason for this change">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={5}
            maxLength={500}
            placeholder="For example: management approved the 2027 attendance policy"
          />
        </Field>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy} aria-busy={busy}>
          <CheckCircle2 size={17} aria-hidden="true" />
          {busy ? "Saving..." : "Save deduction rules"}
        </button>
      </form>
    </section>
  );
}
