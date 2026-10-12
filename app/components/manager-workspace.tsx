"use client";
import { useEffect, useState } from "react";
import {
  api,
  dateLabel,
  locationLabel,
  time,
  type Attendance,
  type Session,
} from "../../lib/api";
import { Requests } from "./requests";
import { Sales } from "./sales";
import { Notifications } from "./notifications";

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
  const [reports, setReports] = useState<{ id: string; name: string }[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [from, setFrom] = useState(session.today);
  const [to, setTo] = useState(session.today);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    api<{ id: string; name: string }[]>("/employees/reports")
      .then(setReports)
      .catch(onError);
  }, [onError]);
  useEffect(() => {
    api<Attendance[]>(`/attendance?from=${from}&to=${to}`)
      .then(setAttendance)
      .catch(onError);
  }, [from, to, onError]);
  return (
    <main className="employee-requests">
      <h1>{session.user.name} / Manager workspace</h1>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <Notifications
        timezone={session.company.timezone}
        revision={revision}
        onError={onError}
      />
      <details>
        <summary>My requests</summary>
        <Requests
          own
          today={session.today}
          employeeId={session.user.employeeId}
          timezone={session.company.timezone}
          revision={revision}
          changed={async () => setRevision((value) => value + 1)}
          onError={onError}
        />
      </details>
      <details open>
        <summary>Direct report requests</summary>
        <Requests
          manager
          employeeId={session.user.employeeId}
          timezone={session.company.timezone}
          revision={revision}
          changed={async () => setRevision((value) => value + 1)}
          onError={onError}
        />
      </details>
      <details>
        <summary>Team attendance</summary>
        <p>{reports.length} direct reports</p>
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="table-wrap">
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
              {attendance.map((row) => (
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
      </details>
      <details>
        <summary>Sales performance</summary>
        <Sales
          today={session.today}
          timezone={session.company.timezone}
          employeeId={session.user.employeeId}
          revision={revision}
          onError={onError}
        />
      </details>
      <button className="button secondary" onClick={logout}>
        Sign out
      </button>
    </main>
  );
}
