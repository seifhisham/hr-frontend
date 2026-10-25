"use client";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Menu,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ApiError,
  api,
  dateLabel,
  initials,
  locationLabel,
  send,
  save,
  time,
  type Attendance,
  type Branch,
  type Company,
  type Employee,
  type Schedule,
  type Session,
} from "../../lib/api";
import { notifySave } from "../../lib/save-toast";
import { Badge, Field } from "./modal";
import { PasswordField } from "./password-field";
import Link from "next/link";
import { CorrectionEditor, EmployeeEditor, ScheduleEditor } from "./editors";
import { Requests } from "./requests";
import { Payroll } from "./payroll";
import { Reports } from "./reports";
import { Departments } from "./departments";
import { Notifications } from "./notifications";
import { Sales } from "./sales";
import { ActivityLog } from "./activity-log";
import { Branches } from "./branches";
import { CompanyLocation } from "./company-location";
import { ManagerWorkspace } from "./manager-workspace";

type View =
  | "overview"
  | "attendance"
  | "departments"
  | "employees"
  | "schedules"
  | "audit"
  | "requests"
  | "manager-reviews"
  | "reports"
  | "payroll"
  | "sales"
  | "branches"
  | "settings"
  | "account";
const navigation: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "attendance", label: "Attendance", icon: Clock3 },
  { id: "requests", label: "Requests", icon: ClipboardList },
  { id: "manager-reviews", label: "Manager reviews", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: ClipboardList },
  { id: "payroll", label: "Payroll", icon: CalendarDays },
  { id: "sales", label: "Sales performance", icon: Building2 },
  { id: "departments", label: "Departments", icon: Building2 },
  { id: "employees", label: "Employees", icon: Users },
  { id: "branches", label: "Branches & access", icon: Building2 },
  { id: "schedules", label: "Work schedules", icon: CalendarDays },
  { id: "audit", label: "Activity log", icon: History },
];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => {
    if (!navigationOpen) return;
    document
      .querySelector<HTMLButtonElement>('.sidebar button[aria-current="page"]')
      ?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        document
          .querySelector<HTMLButtonElement>(".mobile-nav-toggle")
          ?.focus();
      }
      if (event.key === "Tab") {
        const links = document.querySelectorAll<HTMLElement>(
          ".sidebar a[href], .sidebar button:not([disabled])",
        );
        const first = links[0];
        const last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [navigationOpen]);
  const [departmentCatalog, setDepartmentCatalog] = useState<
    { name: string; managerEmployeeId?: string }[]
  >([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [todayRecords, setTodayRecords] = useState<Attendance[]>([]);
  const [requestRevision, setRequestRevision] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [employeeState, setEmployeeState] = useState("all");
  const [loading, setLoading] = useState(false);
  const [employeeEditor, setEmployeeEditor] = useState<Employee | "new" | null>(
    null,
  );
  const [scheduleEditor, setScheduleEditor] = useState<Schedule | "new" | null>(
    null,
  );
  const [correction, setCorrection] = useState<Attendance | null>(null);
  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && [401, 403, 503].includes(e.status)) {
      setSession(null);
      setEmployees([]);
      setRecords([]);
      setTodayRecords([]);
      setBranches([]);
      setSchedules([]);
      setEmployeeEditor(null);
      setCorrection(null);
      setScheduleEditor(null);
    }
    setError(errorMessage(e));
  }, []);
  useEffect(() => {
    let alive = true;
    api<Session>("/auth/me")
      .then((s) => {
        if (alive) {
          setSession(s);
          setFrom(s.today);
          setTo(s.today);
        }
      })
      .catch((e) => {
        if (alive && (!(e instanceof ApiError) || e.status !== 401))
          setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const loadCore = useCallback(async () => {
    if (
      !session ||
      session.user.role === "employee" ||
      session.user.role === "manager" ||
      (session.user.role === "hr" && !session.hrBranchIds?.length)
    )
      return;
    const [people, shifts, today, catalog, branchList] = await Promise.all([
      api<Employee[]>("/employees"),
      api<Schedule[]>("/schedules"),
      api<Attendance[]>(
        `/attendance?from=${session.today}&to=${session.today}`,
      ),
      api<{ name: string; managerEmployeeId?: string }[]>("/departments"),
      api<Branch[]>("/branches"),
    ]);
    setDepartmentCatalog(catalog);
    setBranches(branchList);
    setEmployees(people);
    setSchedules(shifts);
    setTodayRecords(today);
  }, [session]);
  useEffect(() => {
    if (
      !session ||
      session.user.role === "employee" ||
      session.user.role === "manager"
    )
      return;
    let alive = true;
    Promise.all([
      api<Employee[]>("/employees"),
      api<Schedule[]>("/schedules"),
      api<Attendance[]>(
        `/attendance?from=${session.today}&to=${session.today}`,
      ),
      api<{ name: string; managerEmployeeId?: string }[]>("/departments"),
      api<Branch[]>("/branches"),
    ])
      .then(([people, shifts, today, catalog, branchList]) => {
        if (alive) {
          setDepartmentCatalog(catalog);
          setBranches(branchList);
          setEmployees(people);
          setSchedules(shifts);
          setTodayRecords(today);
        }
      })
      .catch((e) => {
        if (alive) handleError(e);
      });
    return () => {
      alive = false;
    };
  }, [session, handleError]);
  const query = new URLSearchParams({
    from,
    to,
    ...(department ? { department } : {}),
    ...(status ? { status } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(branchId ? { branchId } : {}),
  }).toString();
  const reportLoading = loadedQuery !== query;
  const loadReport = useCallback(async () => {
    if (from && to) setRecords(await api<Attendance[]>(`/attendance?${query}`));
  }, [from, to, query]);
  useEffect(() => {
    if (
      !session ||
      session.user.role === "employee" ||
      session.user.role === "manager" ||
      (session.user.role === "hr" && !session.hrBranchIds?.length) ||
      view !== "attendance"
    )
      return;
    let alive = true;
    api<Attendance[]>(`/attendance?${query}`)
      .then((rows) => {
        if (alive) setRecords(rows);
      })
      .catch((e) => {
        if (alive) {
          setRecords([]);
          handleError(e);
        }
      })
      .finally(() => {
        if (alive) setLoadedQuery(query);
      });
    return () => {
      alive = false;
    };
  }, [query, view, session, handleError]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await send("/auth/login", "POST", {
        workspace: data.get("workspace"),
        email: data.get("email"),
        password: data.get("password"),
      });
      const s = await api<Session>("/auth/me");
      setSession(s);
      setFrom(s.today);
      setTo(s.today);
      setView("overview");
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    setLoading(true);
    try {
      await send("/auth/logout", "POST");
      setSession(null);
      setNavigationOpen(false);
      setEmployees([]);
      setDepartmentCatalog([]);
      setRecords([]);
    } catch (e) {
      handleError(e);
    } finally {
      setSession(null);
      setNavigationOpen(false);
      setDepartmentCatalog([]);
      setEmployees([]);
      setRecords([]);
      setTodayRecords([]);
      setBranches([]);
      setSchedules([]);
      setEmployeeEditor(null);
      setCorrection(null);
      setScheduleEditor(null);
      setBranchId("");
      setLoading(false);
    }
  }
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const s = await api<Session>("/auth/me");
      setSession(s);
      await loadCore();
      if (view === "attendance") await loadReport();
      if (view === "audit") setRequestRevision((value) => value + 1);
      if (
        view === "requests" ||
        view === "payroll" ||
        view === "reports" ||
        view === "sales"
      )
        setRequestRevision((v) => v + 1);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  async function exportCsv() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/attendance/export?${query}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new ApiError(body.message ?? "Export failed", res.status);
      }
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attendance-${from}-${to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    notifySave(null);
    setError("");
    const data = new FormData(event.currentTarget);
    let saved = false;
    try {
      const company = await send<Company>("/settings", "PATCH", {
        name: data.get("name"),
        timezone: data.get("timezone"),
        ...(data.has("latitude")
          ? {
              latitude: Number(data.get("latitude")),
              longitude: Number(data.get("longitude")),
              radiusMeters: Number(data.get("radiusMeters")),
              trackingRadiusMeters: Number(data.get("trackingRadiusMeters")),
              trackingGraceMinutes: Number(data.get("trackingGraceMinutes")),
            }
          : {}),
      });
      saved = true;
      setSession((current) => (current ? { ...current, company } : current));
      const next = await api<Session>("/auth/me");
      setSession(next);
      setFrom(next.today);
      setTo(next.today);
      notifySave({
        tone: "success",
        message: "Company settings saved successfully.",
      });
    } catch (e) {
      notifySave(
        saved
          ? {
              tone: "warning",
              message:
                "Settings saved, but the workspace could not refresh. Reload the page.",
            }
          : {
              tone: "error",
              message: `Could not confirm the save: ${errorMessage(e)} Please try again.`,
            },
      );
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("New passwords do not match.");
      setLoading(false);
      return;
    }
    try {
      await save("/auth/password", "POST", {
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      });
      setSession(null);
      notifySave({
        tone: "success",
        message: "Password changed. Sign in with your new password.",
      });
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }
  if (checking)
    return (
      <div className="loading-screen">
        <Building2 size={30} />
        <span>Loading your workspace...</span>
      </div>
    );
  if (!session)
    return (
      <main className="login-page">
        <div className="login-brand">
          <div className="brand-mark">
            <Building2 size={24} />
          </div>
          <span>Company HR</span>
        </div>
        <section className="login-form">
          <div className="login-symbol">
            <ShieldCheck size={28} />
          </div>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to your HR workspace.</p>
          <form onSubmit={login}>
            <Field label="Company code">
              <input
                name="workspace"
                required
                minLength={2}
                maxLength={63}
                pattern="[a-z0-9][a-z0-9-]{1,62}"
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </Field>
            <PasswordField
              label="Password"
              name="password"
              required
              autoComplete="current-password"
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary wide" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
        <footer>Company HR / Administration</footer>
      </main>
    );
  if (session.user.role === "manager")
    return (
      <ManagerWorkspace
        session={session}
        logout={logout}
        onError={handleError}
        error={error}
      />
    );
  if (
    session.user.role === "employee" ||
    (session.user.role === "hr" && !session.hrBranchIds?.length)
  )
    return (
      <main className="employee-requests">
        <h1>{session.user.name} / Employee workspace</h1>
        <Notifications
          key={session.user.id}
          timezone={session.company.timezone}
          revision={requestRevision}
          onError={handleError}
        />
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <Requests
          own
          today={session.today}
          employeeId={session.user.employeeId}
          timezone={session.company.timezone}
          revision={requestRevision}
          changed={async () => setRequestRevision((value) => value + 1)}
          onError={handleError}
        />
        <details>
          <summary>Real estate sales activities</summary>
          <Sales
            personal
            today={session.today}
            timezone={session.company.timezone}
            employeeId={session.user.employeeId}
            revision={requestRevision}
            onError={handleError}
          />
        </details>
        <details>
          <summary>Manager reviews</summary>
          <p>Requests from employees assigned directly to you.</p>
          <Requests
            manager
            employeeId={session.user.employeeId}
            timezone={session.company.timezone}
            revision={requestRevision}
            changed={async () => setRequestRevision((value) => value + 1)}
            onError={handleError}
          />
        </details>
        <button
          className="button secondary"
          onClick={logout}
          disabled={loading}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </main>
    );
  const active = employees.filter((e) => e.active);
  const arrived = todayRecords.filter((r) => r.checkIn);
  const late = todayRecords.filter((r) => r.late);
  const exceptions = todayRecords.filter(
    (r) => r.status === "Missing check-out",
  );
  const departments = [
    ...new Set([
      ...departmentCatalog.map((d) => d.name),
      ...employees.map((e) => e.department),
    ]),
  ].sort();
  const filteredEmployees = employees.filter(
    (e) =>
      `${e.name} ${e.email} ${e.employeeNumber} ${e.nationalId} ${e.department} ${e.accountId ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (employeeState === "all" || e.active === (employeeState === "active")),
  );
  const heading =
    navigation.find((n) => n.id === view)?.label ??
    (view === "settings" ? "Company settings" : "Settings");
  const navigate = (next: View) => {
    setView(next);
    setNavigationOpen(false);
    setError("");
  };
  return (
    <div className={`workspace ${navigationOpen ? "navigation-open" : ""}`}>
      {navigationOpen && (
        <button
          className="navigation-scrim"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />
      )}
      <aside className="sidebar" id="workspace-navigation">
        <Link
          className="brand"
          href="/"
          aria-label="Company HR home"
          onClick={() => navigate("overview")}
        >
          <div className="brand-mark">
            <Building2 size={21} />
          </div>
          <div>
            <strong>{session.company.name}</strong>
            <span>People operations</span>
          </div>
        </Link>
        <div className="nav-label">
          WORKSPACE
          <button
            className="icon-button mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "selected" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {view === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="profile"
            onClick={() => navigate("account")}
            aria-label="Settings"
            title="Settings"
          >
            <span className="avatar">{initials(session.user.name)}</span>
            <strong>{session.user.name}</strong>
            <span className="profile-action">Settings</span>
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-nav-toggle"
            aria-label="Open navigation"
            aria-controls="workspace-navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            {session.company.name}
            <ChevronRight size={14} />
            <strong>{heading}</strong>
          </div>
          <div className="topbar-right">
            <Notifications
              key={session.user.id}
              timezone={session.company.timezone}
              revision={requestRevision}
              onError={handleError}
              onOpen={navigate}
            />
            <span className="topbar-date">
              <CalendarDays size={15} />
              {dateLabel(session.today)}
            </span>
            <span className="timezone">
              <Clock3 size={14} />
              {session.company.timezone}
            </span>
            <button
              className="account-button"
              title="Settings"
              aria-label="Settings"
              onClick={() => navigate("account")}
            >
              <span className="avatar small">
                {initials(session.user.name)}
              </span>
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview" ? "DAILY WORKSPACE" : "PEOPLE OPERATIONS"}
              </div>
              <h1>{heading}</h1>
            </div>
            <div className="heading-actions">
              <button
                className="icon-button"
                title="Refresh records"
                aria-label="Refresh records"
                disabled={loading}
                onClick={refresh}
              >
                <RefreshCw size={18} className={loading ? "spinning" : ""} />
              </button>
              {(view === "employees" || view === "overview") && (
                <button
                  className="button primary"
                  onClick={() => setEmployeeEditor("new")}
                >
                  <Plus size={17} />
                  Add employee
                </button>
              )}
              {view === "attendance" && (
                <button
                  className="button secondary"
                  onClick={exportCsv}
                  disabled={loading || reportLoading || !records.length}
                >
                  <Download size={17} />
                  Export CSV
                </button>
              )}
              {view === "schedules" && session.user.role === "admin" && (
                <button
                  className="button primary"
                  onClick={() => setScheduleEditor("new")}
                >
                  <Plus size={17} />
                  New schedule
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "manager-reviews" && (
            <Requests
              manager
              employeeId={session.user.employeeId}
              timezone={session.company.timezone}
              revision={requestRevision}
              changed={async () => {
                setRequestRevision((value) => value + 1);
                await loadCore();
              }}
              onError={handleError}
            />
          )}
          {view === "requests" && (
            <Requests
              employeeId={session.user.employeeId}
              timezone={session.company.timezone}
              revision={requestRevision}
              changed={async () => {
                await loadCore();
                setRequestRevision((value) => value + 1);
              }}
              onError={handleError}
            />
          )}
          {view === "departments" && (
            <Departments
              departments={departments}
              employees={employees}
              saved={async () => {
                await loadCore();
                setRequestRevision((value) => value + 1);
              }}
            />
          )}
          {view === "reports" && (
            <Reports
              today={session.today}
              company={session.company}
              preparedBy={session.user.name}
              departments={departments}
              revision={requestRevision}
              onError={handleError}
            />
          )}
          {view === "payroll" && (
            <Payroll
              canApprove={session.user.role === "admin"}
              today={session.today}
              revision={requestRevision}
              onError={handleError}
            />
          )}
          {view === "sales" && (
            <Sales
              key={session.user.id}
              today={session.today}
              timezone={session.company.timezone}
              employeeId={session.user.employeeId}
              revision={requestRevision}
              onError={handleError}
            />
          )}
          {view === "overview" && (
            <>
              <div className="metrics">
                <Metric
                  label="Active employees"
                  value={active.length}
                  icon={Users}
                  tone="green"
                  detail={`${departments.length} departments`}
                />
                <Metric
                  label="Checked in today"
                  value={arrived.length}
                  icon={CheckCircle2}
                  tone="blue"
                  detail={`${todayRecords.filter((r) => r.status === "No record").length} scheduled without a record`}
                />
                <Metric
                  label="Late arrivals"
                  value={late.length}
                  icon={Clock3}
                  tone="amber"
                  detail="After the schedule grace period"
                />
                <Metric
                  label="Attendance exceptions"
                  value={exceptions.length}
                  icon={History}
                  tone="rose"
                  detail="Missing check-out today"
                />
              </div>
              <AttendancePulse rows={todayRecords} />
              <section className="section">
                <div className="section-heading">
                  <div>
                    <h2>Today&apos;s attendance</h2>
                    <span className="muted">{dateLabel(session.today)}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("attendance")}
                  >
                    View attendance
                    <ArrowRight size={15} />
                  </button>
                </div>
                <AttendanceTable
                  rows={todayRecords.slice(0, 8)}
                  timezone={session.company.timezone}
                  details={setCorrection}
                />
              </section>
              <div className="overview-bottom">
                <section>
                  <h2>Departments</h2>
                  {departments.length ? (
                    departments.map((d) => (
                      <div className="department-row" key={d}>
                        <span className="department-icon">
                          <Building2 size={17} />
                        </span>
                        <strong>{d}</strong>
                        <span>
                          {
                            employees.filter(
                              (e) => e.department === d && e.active,
                            ).length
                          }{" "}
                          active
                        </span>
                      </div>
                    ))
                  ) : (
                    <Empty icon={Building2} title="No departments yet" />
                  )}
                </section>
                <section>
                  <h2>Work schedules</h2>
                  {schedules.map((s) => (
                    <div className="schedule-summary" key={s.id}>
                      <CalendarDays size={19} />
                      <div>
                        <strong>{s.name}</strong>
                        <span>
                          {s.start} - {s.end} /{" "}
                          {s.days.map((d) => weekdayNames[d]).join(", ")}
                        </span>
                      </div>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => navigate("schedules")}
                  >
                    All schedules
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "attendance" && (
            <>
              <div className="filters">
                <Field label="Branch">
                  <select
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                  >
                    <option value="">All permitted branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="From">
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                  />
                </Field>
                <Field label="To">
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Employee">
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  >
                    <option value="">All employees</option>
                    {employees.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Department">
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    {[
                      "On time",
                      "Late",
                      "Missing check-out",
                      "No record",
                      "Not scheduled",
                      "Approved leave",
                      "Approved holiday",
                      "Approved sick",
                      "Approved unpaid",
                      "Approved urgent",
                      "Approved mission",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <section className="section">
                <div className="section-heading">
                  <h2>Attendance records</h2>
                  <span className="muted">
                    {reportLoading ? "Loading..." : `${records.length} records`}
                  </span>
                </div>
                <AttendanceTable
                  rows={reportLoading ? [] : records}
                  timezone={session.company.timezone}
                  details={setCorrection}
                  loading={reportLoading}
                />
              </section>
            </>
          )}
          {view === "employees" && (
            <>
              <div className="employee-directory-panel">
                <div className="employee-directory-heading">
                  <div>
                    <h2>Employee directory</h2>
                    <p>
                      Find employees by name, email, employee number, national
                      ID, or department.
                    </p>
                  </div>
                  <span className="employee-result-count" role="status">
                    <strong>{filteredEmployees.length}</strong> of{" "}
                    {employees.length} employees
                  </span>
                </div>
                <div className="employee-toolbar">
                  <div className="field employee-search-field">
                    <span>Search directory</span>
                    <label className="search">
                      <Search size={17} aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Search employees"
                        placeholder="Search by name, email, ID, or department"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field employee-status-field">
                    Employee status
                    <select
                      value={employeeState}
                      onChange={(e) => setEmployeeState(e.target.value)}
                    >
                      <option value="all">All employees</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Job title</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="person">
                            <span className="avatar">{initials(e.name)}</span>
                            <div>
                              <strong>{e.name}</strong>
                              <span>
                                {e.employeeNumber} / {e.nationalId} / {e.email}
                              </span>
                              <span className="employee-account-id">
                                Account UUID:{" "}
                                <code>
                                  {e.accountId ?? "No linked account"}
                                </code>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{e.department}</td>
                        <td>{e.jobTitle}</td>
                        <td>
                          {schedules.find((s) => s.id === e.scheduleId)?.name}
                        </td>
                        <td>
                          <Badge value={e.active ? "Active" : "Inactive"} />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            title={`Edit ${e.name}`}
                            aria-label={`Edit ${e.name}`}
                            onClick={() => setEmployeeEditor(e)}
                            disabled={
                              session.user.role !== "admin" &&
                              e.role !== "employee" &&
                              e.role !== "manager"
                            }
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredEmployees.length && (
                  <Empty
                    icon={Users}
                    title={
                      search ? "No matching employees" : "No employees yet"
                    }
                    action={
                      !search ? (
                        <button
                          className="button primary"
                          onClick={() => setEmployeeEditor("new")}
                        >
                          <Plus size={16} />
                          Add employee
                        </button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </>
          )}
          {view === "schedules" && (
            <div className="schedule-list">
              {schedules.map((s) => (
                <article className="schedule-row" key={s.id}>
                  <div className="schedule-icon">
                    <CalendarDays size={23} />
                  </div>
                  <div className="schedule-info">
                    <h2>{s.name}</h2>
                    <div className="schedule-times">
                      {s.start} - {s.end}
                      <span>{s.graceMinutes} min grace period</span>
                    </div>
                    <div className="days-strip">
                      {weekdayNames.map((d, i) => (
                        <span
                          key={d}
                          className={s.days.includes(i) ? "working" : ""}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="schedule-meta">
                    {
                      employees.filter((e) => e.scheduleId === s.id && e.active)
                        .length
                    }{" "}
                    active employees
                  </div>
                  {session.user.role === "admin" && (
                    <button
                      className="icon-button"
                      title={`Edit ${s.name}`}
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setScheduleEditor(s)}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {view === "audit" && (
            <ActivityLog
              timezone={session.company.timezone}
              revision={requestRevision}
              onError={handleError}
            />
          )}
          {view === "branches" && (
            <Branches
              branches={branches}
              employees={employees}
              company={session.company}
              today={session.today}
              role={session.user.role}
              refresh={loadCore}
              onError={handleError}
            />
          )}
          {view === "settings" && (
            <section className="settings-section">
              <h2>Company details</h2>
              <form
                onSubmit={saveCompany}
                key={JSON.stringify(session.company)}
              >
                <Field label="Company name">
                  <input
                    name="name"
                    defaultValue={session.company.name}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field label="Attendance timezone">
                  <input
                    name="timezone"
                    defaultValue={session.company.timezone}
                    required
                    list="timezones"
                  />
                  <datalist id="timezones">
                    {[
                      "Africa/Cairo",
                      "Asia/Riyadh",
                      "Asia/Dubai",
                      "Europe/London",
                      "UTC",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </datalist>
                </Field>
                {branches.filter((branch) => branch.active).length === 1 && (
                  <>
                    <CompanyLocation company={session.company} />
                    <Field label="Time to return (minutes)">
                      <input
                        name="trackingGraceMinutes"
                        type="number"
                        min={1}
                        max={1440}
                        step={1}
                        required
                        defaultValue={session.company.trackingGraceMinutes}
                      />
                      <small>
                        Automatic checkout occurs if the employee stays reliably
                        outside until this time expires. Existing warning
                        deadlines remain unchanged when settings are saved.
                      </small>
                    </Field>
                  </>
                )}
                <p className="muted">
                  Manage individual office locations and attendance policies
                  under Branches & access.
                </p>
                <button
                  className="button primary"
                  disabled={loading}
                  aria-busy={loading}
                >
                  <CheckCircle2 size={17} aria-hidden="true" />
                  {loading ? "Saving..." : "Save settings"}
                </button>
              </form>
            </section>
          )}
          {view === "account" && (
            <section className="settings-section">
              <h2>{session.user.name}</h2>
              <p className="muted">{session.user.email}</p>
              {session.user.role === "admin" && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => navigate("settings")}
                >
                  <Settings2 size={17} />
                  Company settings
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={logout}
                disabled={loading}
              >
                <LogOut size={17} />
                Sign out
              </button>
              <h3>Change password</h3>
              <form onSubmit={changePassword}>
                <PasswordField
                  label="Current password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                />
                <PasswordField
                  label="New password"
                  name="newPassword"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
                <PasswordField
                  label="Confirm new password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
                <button className="button primary" disabled={loading}>
                  <ShieldCheck size={17} />
                  Change password
                </button>
              </form>
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          <span>{session.company.name}</span>
          <span>People & attendance</span>
        </footer>
      </div>
      {employeeEditor && (
        <EmployeeEditor
          employee={employeeEditor === "new" ? null : employeeEditor}
          schedules={schedules}
          branches={branches}
          departments={departments}
          employees={employees}
          role={session.user.role}
          today={session.today}
          close={() => setEmployeeEditor(null)}
          saved={loadCore}
        />
      )}
      {scheduleEditor && (
        <ScheduleEditor
          schedule={scheduleEditor === "new" ? null : scheduleEditor}
          close={() => setScheduleEditor(null)}
          saved={loadCore}
        />
      )}
      {correction && (
        <CorrectionEditor
          record={correction}
          close={() => setCorrection(null)}
          saved={async () => {
            await loadCore();
            if (view === "attendance") await loadReport();
          }}
        />
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
  tone,
  detail,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  detail: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}
function AttendancePulse({ rows }: { rows: Attendance[] }) {
  const groups = [
    {
      label: "Not late",
      tone: "green",
      count: rows.filter((r) => r.checkIn && !r.late).length,
    },
    { label: "Late", tone: "amber", count: rows.filter((r) => r.late).length },
    {
      label: "Time off",
      tone: "blue",
      count: rows.filter((r) => r.status.startsWith("Approved ")).length,
    },
    {
      label: "No record",
      tone: "neutral",
      count: rows.filter((r) => r.status === "No record").length,
    },
  ];
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <section
      className="attendance-pulse"
      aria-label="Today's attendance distribution"
    >
      <div className="pulse-title">
        <span>Attendance snapshot</span>
        <strong>{total} employees</strong>
      </div>
      <div className="pulse-chart">
        <div
          className="pulse-bar"
          role="img"
          aria-label={groups.map((g) => `${g.label}: ${g.count}`).join(", ")}
        >
          {groups
            .filter((g) => g.count > 0)
            .map((g) => (
              <span
                key={g.label}
                className={g.tone}
                style={{ width: `${(g.count / total) * 100}%` }}
              />
            ))}
        </div>
        <div className="pulse-legend">
          {groups.map((g) => (
            <span key={g.label}>
              <i className={g.tone} />
              {g.label}
              <strong>{g.count}</strong>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
function Empty({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.5} />
      <strong>{title}</strong>
      {action}
    </div>
  );
}
function AttendanceTable({
  rows,
  timezone,
  details,
  loading,
}: {
  rows: Attendance[];
  timezone: string;
  details: (r: Attendance) => void;
  loading?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Date</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Hours</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.employeeId}:${r.workDate}`}>
              <td>
                <div className="person">
                  <span className="avatar">{initials(r.name)}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.department} / {r.nationalId}
                    </span>
                  </div>
                </div>
              </td>
              <td>{dateLabel(r.workDate)}</td>
              <td>{time(r.checkIn, r.timezone || timezone)}</td>
              <td>{time(r.checkOut, r.timezone || timezone)}</td>
              <td>{r.hours === null ? "--" : `${r.hours.toFixed(2)} h`}</td>
              <td>
                <Badge value={r.status} />
                {locationLabel(r) && (
                  <div>
                    {locationLabel(r)}
                    {r.location?.returnBy &&
                      ` — return by ${time(r.location.returnBy, r.timezone || timezone)}`}
                  </div>
                )}
              </td>
              <td>
                {
                  <button
                    className="icon-button"
                    title={`Attendance details for ${r.name}`}
                    aria-label={`Attendance details for ${r.name}`}
                    onClick={() => details(r)}
                  >
                    {r.id ? <Pencil size={16} /> : <Plus size={16} />}
                  </button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          icon={Clock3}
          title={loading ? "Loading attendance..." : "No attendance records"}
        />
      )}
    </div>
  );
}
