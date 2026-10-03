export type Role = "employee" | "hr" | "admin";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId: string | null;
};
export type Company = { name: string; timezone: string };
export type Session = { user: User; company: Company; today: string };
export type Schedule = {
  id: string;
  name: string;
  start: string;
  end: string;
  days: number[];
  graceMinutes: number;
};
export type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  startDate: string;
  scheduleId: string;
  active: boolean;
  role: Role;
};
export type Attendance = {
  id: string | null;
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  late: boolean;
  hours: number | null;
  timezone: string;
};
export type Audit = {
  id: string;
  actor: string;
  action: string;
  recordId: string;
  at: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type EmployeeRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  type: "leave" | "holiday" | "forgotten-check-out";
  from?: string;
  to?: string;
  proposedCheckOut?: string;
  attendance: { checkIn: string; workDate: string; timezone: string } | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    throw new ApiError(
      body?.message
        ? String(body.message)
        : "Request failed. Please try again.",
      res.status,
    );
  }
  return res.json() as Promise<T>;
}
export const send = <T>(
  path: string,
  method: "POST" | "PATCH",
  body?: unknown,
) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export function time(value: string | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "--";
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
export function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
}
