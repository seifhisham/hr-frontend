"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { api, type Audit } from "../../lib/api";
import { auditLabel, auditFields } from "../../lib/audit-display";
import { Field, Modal } from "./modal";

export function ActivityLog({
  timezone,
  revision,
  onError,
}: {
  timezone: string;
  revision: number;
  onError: (error: unknown) => void;
}) {
  const [filters, setFilters] = useState("");
  const [version, setVersion] = useState(0);
  const listKey = JSON.stringify([filters, version, revision]);
  const [pagination, setPagination] = useState<{
    key: string;
    cursors: string[];
  }>({ key: "", cursors: [] });
  const cursors = pagination.key === listKey ? pagination.cursors : [];
  const before = cursors.at(-1);
  const key = JSON.stringify([listKey, before]);
  const [result, setResult] = useState<{
    key: string;
    rows: Audit[];
    failed?: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Audit | null>(null);
  const loaded = result?.key === key;
  const rows = loaded ? result.rows.slice(0, 50) : [];
  const more = loaded && result.rows.length > 50;
  const stamp = (value: string) =>
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams(filters);
    query.set("limit", "51");
    if (before) query.set("before", before);
    api<Audit[]>(`/audit?${query}`)
      .then((rows) => {
        if (alive) setResult({ key, rows });
      })
      .catch((e) => {
        if (alive) {
          setResult({ key, rows: [], failed: true });
          onError(e);
        }
      });
    return () => {
      alive = false;
    };
  }, [key, filters, before, onError]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) {
      const text = String(value).trim();
      if (text) query.set(name, text);
    }
    setFilters(query.toString());
    setVersion((v) => v + 1);
  }
  return (
    <section className="section">
      <form
        className="audit-filter-panel"
        onSubmit={apply}
        onReset={() => {
          setFilters("");
          setVersion((v) => v + 1);
        }}
      >
        <h2>Find an activity</h2>
        <p>
          Search who acted, what changed, or the affected record. Dates filter
          UTC days; event times are shown in {timezone}.
        </p>
        <div className="audit-filter-grid">
          <Field label="Search">
            <input
              name="search"
              type="search"
              placeholder="Name, employee details, reason…"
              maxLength={120}
            />
          </Field>
          <Field label="Exact action">
            <input
              name="action"
              placeholder="e.g. employee.updated"
              maxLength={120}
            />
          </Field>
          <Field label="Record ID">
            <input
              name="recordId"
              placeholder="Employee, request, or record ID"
              maxLength={120}
            />
          </Field>
          <Field label="Actor account ID">
            <input name="actorId" placeholder="Account UUID" />
          </Field>
          <Field label="From (UTC)">
            <input name="from" type="date" />
          </Field>
          <Field label="To (UTC)">
            <input name="to" type="date" />
          </Field>
        </div>
        <div className="audit-filter-actions">
          <button className="button secondary" type="reset">
            Clear filters
          </button>
          <button className="button primary">
            <Search size={16} aria-hidden="true" />
            Search log
          </button>
        </div>
      </form>
      <div className="audit-list-heading">
        <div>
          <h2>Activity history</h2>
          <span className="muted" role="status">
            {loaded
              ? result.failed
                ? "Unable to load activities"
                : `${rows.length} entries on this page`
              : "Loading activities…"}
          </span>
        </div>
        <div className="audit-navigation">
          <button
            className="button secondary"
            disabled={!loaded}
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button
            className="button secondary"
            disabled={!loaded || !cursors.length}
            onClick={() =>
              setPagination({ key: listKey, cursors: cursors.slice(0, -1) })
            }
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </button>
          <span>Page {cursors.length + 1}</span>
          <button
            className="button secondary"
            disabled={!more}
            onClick={() =>
              setPagination({
                key: listKey,
                cursors: [...cursors, rows[rows.length - 1].id],
              })
            }
          >
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="table-wrap" aria-busy={!loaded}>
        <table>
          <thead>
            <tr>
              <th>When ({timezone})</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td>{stamp(entry.at)}</td>
                <td>
                  <strong>{entry.actor}</strong>
                </td>
                <td>
                  <span>{auditLabel(entry.action)}</span>
                </td>
                <td>
                  <code>{entry.recordId}</code>
                </td>
                <td>
                  <button
                    className="button secondary"
                    onClick={() => setSelected(entry)}
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loaded && !rows.length && (
        <div className="empty">
          <strong>
            {result.failed
              ? "Unable to load the log. Refresh to retry."
              : "No activities match these filters"}
          </strong>
        </div>
      )}
      {selected && (
        <Modal title="Activity details" close={() => setSelected(null)}>
          <div className="audit-detail-content">
            <dl className="audit-detail-meta">
              <dt>Who</dt>
              <dd>{selected.actor}</dd>
              <dt>Account ID</dt>
              <dd>{selected.actorId}</dd>
              <dt>Action</dt>
              <dd>{auditLabel(selected.action)}</dd>
              <dt>Record ID</dt>
              <dd>{selected.recordId}</dd>
              <dt>When</dt>
              <dd>
                {stamp(selected.at)} ({timezone})
              </dd>
              <dt>Event ID</dt>
              <dd>{selected.id}</dd>
              <dt>Reason</dt>
              <dd>{selected.reason || "No reason recorded"}</dd>
            </dl>
            <div className="audit-snapshots">
              <div>
                <h3>Before</h3>
                <dl className="audit-readable-fields">
                  {auditFields(selected.before).length ? auditFields(selected.before).map((item) => <div key={item.field}><dt>{item.field}</dt><dd>{item.value}</dd></div>) : <p>No previous details recorded</p>}
                </dl>
              </div>
              <div>
                <h3>After</h3>
                <dl className="audit-readable-fields">
                  {auditFields(selected.after).length ? auditFields(selected.after).map((item) => <div key={item.field}><dt>{item.field}</dt><dd>{item.value}</dd></div>) : <p>No new details recorded</p>}
                </dl>
              </div>
            </div>
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
