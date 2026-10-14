"use client";
import { useEffect, useState } from "react";
import {
  api,
  dateLabel,
  locationLabel,
  initials,
  time,
  type Attendance,
  type Session,
} from "../../lib/api";
import { Building2, ClipboardList, Clock3, ChevronRight, Menu, X } from "lucide-react";
import { Field } from "./modal";
import { Requests } from "./requests";
import { Sales } from "./sales";
import { Notifications } from "./notifications";

const pages = [
  { id: "team", label: "My team's requests", icon: ClipboardList },
  { id: "own", label: "My requests", icon: ClipboardList },
  { id: "attendance", label: "Team attendance", icon: Clock3 },
  { id: "sales", label: "Sales performance", icon: Building2 },
] as const;

export function ManagerWorkspace({
  session,
  logout,
  onError,
  error,
}: {
  session: Session;
  logout: () => void;
  onError: (error: unknown) => void;
  error: string;
}) {
  const [view, setView] = useState<string>("team");
  const [navigationOpen, setNavigationOpen] = useState(false);

  const [reports, setReports] = useState<{ id: string; name: string }[]>([]);
  const [attendanceResult, setAttendanceResult] = useState<{ key: string; rows: Attendance[]; failed?: boolean } | null>(null);
  const [from, setFrom] = useState(session.today);
  const [to, setTo] = useState(session.today);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    api<{ id: string; name: string }[]>("/employees/reports")
      .then((rows) => { if (alive) setReports(rows); })
      .catch((e) => { if (alive) onError(e); });
    return () => { alive = false; };
  }, [onError]);
  const attendanceKey = JSON.stringify([view, from, to]);
  const attendanceLoading = view === "attendance" && !!from && !!to && from <= to && attendanceResult?.key !== attendanceKey;
  const attendance = attendanceResult?.key === attendanceKey ? attendanceResult.rows : [];
  useEffect(() => {
    if (view !== "attendance" || !from || !to || from > to) return;
    let alive = true;
    api<Attendance[]>(`/attendance?${new URLSearchParams({ from, to })}`)
      .then((rows) => { if (alive) setAttendanceResult({ key: attendanceKey, rows }); })
      .catch((e) => { if (alive) { setAttendanceResult({ key: attendanceKey, rows: [], failed: true }); onError(e); } });
    return () => { alive = false; };
  }, [attendanceKey, view, from, to, onError]);
  const heading = pages.find((page) => page.id === view)!.label;
  return (
    <div className={`workspace ${navigationOpen ? "navigation-open" : ""}`}>
      {navigationOpen && <button className="navigation-scrim" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
      <aside className="sidebar" id="manager-navigation">
        <div className="brand">
          <div className="brand-mark"><Building2 size={21} aria-hidden="true" /></div>
          <div><strong>{session.company.name}</strong><span>People operations</span></div>
        </div>
        <div className="nav-label">MANAGER WORKSPACE
          <button className="icon-button mobile-nav-close" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}><X size={18} /></button>
        </div>
        <nav aria-label="Manager navigation">
          {pages.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? "selected" : ""}`} aria-current={view === id ? "page" : undefined}
              onClick={() => { setView(id); setNavigationOpen(false); }}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
              {view === id && <ChevronRight size={15} aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile" onClick={logout} aria-label="Sign out">
            <span className="avatar">{initials(session.user.name)}</span>
            <strong>{session.user.name}</strong>
            <span className="profile-action">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button className="icon-button mobile-nav-toggle" aria-label="Open navigation" aria-controls="manager-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb">{session.company.name}<ChevronRight size={14} aria-hidden="true" /><strong>{heading}</strong></div>
          <div className="topbar-right">
            <Notifications timezone={session.company.timezone} revision={revision} onError={onError} />
            <span className="topbar-date">{dateLabel(session.today)}</span>
          </div>
        </header>
        <main className="manager-content">
          <div className="manager-page-heading"><span>PEOPLE OPERATIONS</span><h1>{heading}</h1></div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {view === "own" && <section>
        <Requests
          own
          today={session.today}
          employeeId={session.user.employeeId}
          timezone={session.company.timezone}
          revision={revision}
          changed={async () => setRevision((value) => value + 1)}
          onError={onError}
        />
      </section>}
      {view === "team" && <section>
        <div className="manager-help-panel"><h2>Requests from your direct reports</h2><p>Recommend approval or rejection with a reason. HR makes the final decision.</p><span>{reports.length} employees assigned to you</span></div>
        <Requests
          manager
          employeeId={session.user.employeeId}
          timezone={session.company.timezone}
          revision={revision}
          changed={async () => setRevision((value) => value + 1)}
          onError={onError}
        />
      </section>}
      {view === "attendance" && <section>
        <div className="manager-help-panel"><h2>Team attendance</h2><p>Attendance records for employees assigned directly to you.</p><span>{reports.length} direct reports</span></div>
        <div className="report-filter-panel report-controls">
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        </div>
        {from > to && <p className="message error" role="alert">End date must follow start date.</p>}
        {attendanceLoading && <p role="status">Loading team attendance…</p>}
        <div className="table-wrap" aria-busy={attendanceLoading}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Day</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(from <= to ? attendance : []).map((row) => (
                <tr key={`${row.employeeId}:${row.workDate}`}>
                  <td>{row.name}</td>
                  <td>{dateLabel(row.workDate)}</td>
                  <td>{time(row.checkIn, row.timezone)}</td>
                  <td>{time(row.checkOut, row.timezone)}</td>
                  <td>
                    {row.status}
                    {locationLabel(row) && (
                      <div>
                        {locationLabel(row)}
                        {row.location?.returnBy &&
                          ` — return by ${time(row.location.returnBy, row.timezone)}`}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!attendanceLoading && !attendanceResult?.failed && !!from && !!to && from <= to && !attendance.length && <div className="empty"><strong>No team attendance for this period</strong></div>}
      </section>}
      {view === "sales" && <section>
        <Sales
          today={session.today}
          timezone={session.company.timezone}
          employeeId={session.user.employeeId}
          revision={revision}
          onError={onError}
        />
      </section>}
        </main>
      </div>
    </div>
  );
}
