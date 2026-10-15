import { notifySave } from "./save-toast";

export type Role = "employee" | "manager" | "hr" | "admin";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId: string | null;
};
export type Company = { name: string; timezone: string; latitude: number; longitude: number; radiusMeters: number; trackingRadiusMeters: number; trackingGraceMinutes: number };
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
  accountId?: string | null;
  employeeNumber: string;
  monthlySalary: number | null;
  salaryCurrency: string;
  nationalId: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  startDate: string;
  scheduleId: string;
  active: boolean;
  salesEnabled: boolean;
  role: Role;
  managerId?: string | null;
};
export type PayrollRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  department: string;
  active: boolean;
  month: string;
  currency: string;
  grossSalary: number | null;
  dailyRate: number | null;
  deductionDays: number;
  deductionAmount: number | null;
  netSalary: number | null;
  deductions: {
    requestId: string;
    status: string;
    decidedAt: string;
    days: number;
  }[];
  manualDeductions: PayrollDeduction[];
};
export type PayrollDeduction = {
  id: string;
  employeeId: string;
  month: string;
  days: number;
  reason: string;
  approvedBy: string;
  recordedAt: string;
  recordedBy: string;
  recordedById: string;
};
export type Attendance = {
  location?: {
    status: "inside" | "outside" | "unavailable" | "auto-checked-out";
    returnBy: string | null;
    autoCheckedOutAt: string | null;
  } | null;
  id: string | null;
  employeeId: string;
  nationalId: string;
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
export function locationLabel(record: Attendance) {
  if (
    !record.location ||
    (record.checkOut && record.location.status !== "auto-checked-out")
  )
    return "";
  return {
    inside: "Inside office boundary",
    outside: record.location.returnBy
      ? "Outside office — return window active"
      : "Outside office — confirming departure",
    unavailable: "Location service unavailable",
    "auto-checked-out": "Automatically checked out: outside office",
  }[record.location.status];
}
export type Audit = {
  id: string;
  actorId: string;
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
  nationalId: string;
  type:
    | "leave"
    | "holiday"
    | "sick"
    | "unpaid"
    | "urgent"
    | "excuse"
    | "mission"
    | "forgotten-check-out";
  durationMinutes?: number;
  excuseType?: "leaving-early" | "arriving-late" | "during-shift";
  shiftId?: string;
  attachments?: { name: string; mimeType: string; content: string }[];
  from?: string;
  to?: string;
  proposedCheckOut?: string;
  attendance: { checkIn: string; workDate: string; timezone: string } | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  managerReview?: {
    status: "approved" | "rejected";
    employeeId: string;
    department: string;
    reviewedBy: string;
    reviewedAt: string;
    reason: string;
  } | null;
  managerStage?: "not-required" | "pending" | "approved" | "rejected";
  managerEmployeeId?: string | null;
  managerDepartment?: string;
  lastChange?: {
    action: "withdraw" | "reopen";
    reason: string;
    at: string;
    by: string;
  };
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  salaryDeductionDays: number | null;
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

export async function save<T>(path: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  notifySave(null);
  try {
    const result = await send<T>(path, method, body);
    notifySave({ tone: "success", message: "Changes saved successfully." });
    return result;
  } catch (error) {
    notifySave({ tone: "error", message: `Could not confirm the save: ${error instanceof Error ? error.message : "Please try again."}` });
    throw error;
  }
}

export async function allRequests(): Promise<EmployeeRequest[]> {
  const rows: EmployeeRequest[] = [];
  let before: string | undefined;
  while (true) {
    const query = new URLSearchParams({
      limit: "100",
      ...(before ? { before } : {}),
    });
    const page = await api<EmployeeRequest[]>(`/requests?${query}`);
    rows.push(...page);
    if (page.length < 100) return rows;
    before = page[page.length - 1].id;
  }
}
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

export type NotificationItem = {
  id: string;
  type:
    | "manager-review-required"
    | "manager-reviewed"
    | "request-decided"
    | "request-reopened"
    | "pending-request"
    | "missing-check-out";
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  requestId?: string;
  attendanceId?: string;
};
export type NotificationInbox = {
  items: NotificationItem[];
  unreadCount: number;
};

export type PayrollRun = {
  month: string;
  status: "draft" | "approved";
  company: string;
  timezone: string;
  revision: string;
  approvedAt: string | null;
  approvedBy: string | null;
  approvedById: string | null;
  approvalReason: string | null;
  rows: PayrollRow[];
};

export type SalesAccess = {
  canSubmit: boolean;
  canReview: boolean;
  canSetTargets: boolean;
};
export type SalesActivityInput =
  | {
      kind: "meeting" | "viewing";
      activityDate: string;
      clientName: string;
      projectName: string;
      propertyReference: string;
      notes: string;
      purpose: string;
      outcome: string;
      followUpDate: string | null;
    }
  | {
      kind: "closed-deal";
      activityDate: string;
      clientName: string;
      projectName: string;
      propertyReference: string;
      notes: string;
      dealReference: string;
      transactionType: "sale" | "lease";
      value: number;
      currency: string;
    };
export type SalesActivity = SalesActivityInput & {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  submittedAt: string;
  updatedAt: string;
  revision: number;
  status: "pending" | "verified" | "returned";
  canReview: boolean;
  review: {
    status: "verified" | "returned";
    reason: string;
    by: string;
    byId: string;
    at: string;
  } | null;
};
export type SalesTarget = {
  employeeId: string;
  month: string;
  meetings: number;
  deals: number;
  transactionValue: number | null;
  currency: string | null;
  revision: number;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};
export type SalesPerformance = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  active: boolean;
  salesEnabled: boolean;
  month: string;
  meetings: number;
  viewings: number;
  meetingTotal: number;
  deals: number;
  sales: number;
  leases: number;
  transactionValues: Record<string, number>;
  pending: number;
  returned: number;
  target: SalesTarget | null;
  achievement: {
    meetings: number | null;
    deals: number | null;
    transactionValue: number | null;
  };
};
