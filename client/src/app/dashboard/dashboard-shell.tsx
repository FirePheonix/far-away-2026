"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  Clock3,
  Command,
  Database,
  LayoutDashboard,
  Link2,
  Mail,
  NotepadText,
  Package,
  Search,
  Settings,
  Sheet,
  User2,
  Users2,
} from "lucide-react";

type DashboardApp = {
  id: string;
  label: string;
  connected: boolean;
};

type DashboardRun = {
  id: string;
  transcript: string;
  requestStatus: string;
  success: boolean | null;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

type DashboardContact = {
  id: string;
  display_name: string;
  primary_email: string | null;
  organization: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
};

type DashboardMemoryItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DashboardSummaryResponse = {
  profile: {
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  google: {
    connected: boolean;
    email: string | null;
    connectedAt: string | null;
  };
  apps: DashboardApp[];
  recentRuns: DashboardRun[];
  contacts: DashboardContact[];
  memoryItems: DashboardMemoryItem[];
  dataStats: {
    contacts: number;
    memories: number;
    vectorReady: number;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api";

const APP_ICON_BY_ID: Record<string, React.ComponentType<{ className?: string }>> = {
  google_sheets: Sheet,
  gmail: Mail,
  google_calendar: CalendarCheck2,
  google_meet: Clock3,
  slack: Command,
  github: Circle,
  notion: NotepadText,
};

const NAV_GROUPS = [
  {
    title: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Runs", href: "/dashboard/runs", icon: Activity },
      { label: "Connections", href: "/dashboard/connections", icon: Link2 },
      { label: "Apps", href: "/dashboard/apps", icon: Package },
      { label: "Data", href: "/dashboard/data", icon: Database },
    ],
  },
  {
    title: "Other",
    items: [{ label: "Settings", href: "/dashboard/settings", icon: Settings }],
  },
];

type DashboardView = "dashboard" | "apps" | "runs" | "connections" | "data" | "settings";

function prettyDuration(durationMs: number | null): string {
  if (!durationMs) return "Running";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function shortTranscript(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > 82 ? `${clean.slice(0, 82)}...` : clean;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function providerForApp(appId: string): "google" | "slack" | "github" | "notion" {
  if (appId.startsWith("google_") || appId === "gmail") return "google";
  if (appId === "slack") return "slack";
  if (appId === "github") return "github";
  return "notion";
}

function urlForApp(appId: string): string | null {
  switch (appId) {
    case "google_sheets": return "https://docs.google.com/spreadsheets/";
    case "gmail": return "https://mail.google.com/";
    case "google_calendar": return "https://calendar.google.com/";
    case "google_meet": return "https://meet.google.com/";
    case "slack": return "https://app.slack.com/";
    case "github": return "https://github.com/";
    case "notion": return "https://notion.so/";
    default: return null;
  }
}

export function DashboardShell({ view }: { view: DashboardView }) {
  const { getToken, userId, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      router.replace("/sign-in");
      return;
    }

    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("No Clerk session token available");

        const response = await fetch(`${API_URL}/dashboard/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Backend responded ${response.status}`);

        setSummary((await response.json()) as DashboardSummaryResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [getToken, isLoaded, router, userId]);

  async function connectApp(provider: string) {
    setConnectingProvider(provider);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No Clerk session token available");

      const response = await fetch(`${API_URL}/auth/${provider}/start`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Could not start ${provider} OAuth (${response.status})`);
      }

      const payload = (await response.json()) as { authUrl: string };
      if (!payload.authUrl) throw new Error("Backend did not return OAuth URL");

      window.location.href = payload.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "App connection failed");
      setConnectingProvider(null);
    }
  }

  const oauthStateNote = useMemo(() => {
    const status = searchParams.get("google");
    if (status === "connected") return "Google connected successfully.";
    if (status === "error") return "Google connection failed. Try again.";
    return null;
  }, [searchParams]);

  const apps = summary?.apps ?? [];
  const runs = summary?.recentRuns ?? [];
  const contacts = summary?.contacts ?? [];
  const memoryItems = summary?.memoryItems ?? [];
  const connectedCount = apps.filter((app) => app.connected).length;
  const completedRuns = runs.filter((run) => run.success === true).length;
  const failedRuns = runs.filter((run) => run.success === false).length;
  const runningRuns = runs.filter((run) => run.success === null).length;

  return (
    <main className="h-screen overflow-hidden bg-brand-bg text-brand-dark">
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-brand-dark/10 bg-[#fbfaf8]">
          <div className="h-16 border-b border-brand-dark/10 px-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-brand-dark text-white flex items-center justify-center">
              <Command className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">clawvio</p>
              <p className="text-xs text-brand-text/55 leading-none mt-1">Workspace</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-xs font-semibold text-brand-text/50">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={[
                          "w-full h-9 rounded-md px-2.5 flex items-center gap-2.5 text-sm text-left transition",
                          active
                            ? "bg-brand-dark text-white"
                            : "text-brand-text/80 hover:bg-brand-dark/5",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-brand-dark/10 p-3">
            <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-brand-dark/5">
              <div className="h-9 w-9 rounded-md bg-[#ebe9e4] flex items-center justify-center overflow-hidden">
                {user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.imageUrl} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User2 className="h-4 w-4 text-brand-dark/70" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {user?.fullName ?? summary?.profile?.full_name ?? "Your profile"}
                </p>
                <p className="truncate text-xs text-brand-text/60">
                  {user?.primaryEmailAddress?.emailAddress ??
                    summary?.profile?.email ??
                    "Signed in"}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 h-screen overflow-y-auto">
          <header className="sticky top-0 z-20 h-16 border-b border-brand-dark/10 bg-brand-bg/95 px-4 md:px-6 flex items-center gap-4 backdrop-blur-sm">
            <div className="md:hidden h-8 w-8 rounded-md bg-brand-dark text-white flex items-center justify-center">
              <Command className="h-4 w-4" />
            </div>
            <div className="relative hidden sm:block w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text/45" />
              <input
                className="h-9 w-full rounded-md border border-brand-dark/10 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-brand-text/45"
                placeholder="Search runs, apps..."
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => connectApp("google")}
                disabled={connectingProvider === "google"}
                className="h-9 rounded-md bg-brand-dark px-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {connectingProvider === "google"
                  ? "Redirecting"
                  : summary?.google.connected
                    ? "Reconnect Google"
                    : "Connect Google"}
              </button>
              <UserButton />
            </div>
          </header>

          <div className="px-4 py-6 md:px-6 max-w-7xl mx-auto">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">
                  {view === "dashboard"
                    ? "Dashboard"
                    : view[0].toUpperCase() + view.slice(1)}
                </h1>
                <p className="text-sm text-brand-text/65">
                  {view === "apps"
                    ? "Connect the tools Clawvio can read from and act inside."
                    : view === "runs"
                      ? "Recent assistant executions from Supabase."
                      : view === "connections"
                        ? "Connection health across your workspace apps."
                        : view === "data"
                          ? "Workspace data sources and defaults."
                          : view === "settings"
                            ? "Account and workspace preferences."
                            : "Conversation runs, workspace connections, and execution state."}
                </p>
              </div>
            </div>

            <div className="mb-4 flex gap-1 overflow-x-auto rounded-md bg-[#ebe9e4] p-1 w-fit">
              {["Overview", "Analytics", "Reports", "Notifications"].map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  disabled={index > 1}
                  className={[
                    "h-8 rounded px-3 text-sm",
                    index === 0
                      ? "bg-white text-brand-dark shadow-sm"
                      : "text-brand-text/65 disabled:opacity-45",
                  ].join(" ")}
                >
                  {tab}
                </button>
              ))}
            </div>

            {(oauthStateNote || error) && (
              <div className="mb-4 rounded-md border border-brand-dark/10 bg-white px-4 py-3 text-sm">
                {oauthStateNote && <span className="text-brand-text/80">{oauthStateNote}</span>}
                {error && <span className="text-red-600">{error}</span>}
              </div>
            )}

            {view === "dashboard" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Connected Apps", value: `${connectedCount}/${apps.length || 7}`, meta: "available tools", icon: Link2 },
                { label: "Total Runs", value: runs.length.toString(), meta: `${completedRuns} completed`, icon: Activity },
                { label: "Contacts", value: contacts.length.toString(), meta: "remembered people", icon: Users2 },
                { label: "Memory", value: memoryItems.length.toString(), meta: `${runningRuns} active, ${failedRuns} failed`, icon: BrainCircuit },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="rounded-lg border border-brand-dark/10 bg-white p-4">
                    <div className="flex items-center justify-between pb-2">
                      <p className="text-sm font-medium">{metric.label}</p>
                      <Icon className="h-4 w-4 text-brand-text/55" />
                    </div>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <p className="text-xs text-brand-text/60">{metric.meta}</p>
                  </div>
                );
              })}
            </div>}

            {(view === "dashboard" || view === "apps") && <section className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Apps</h2>
                  <p className="text-sm text-brand-text/65">
                    Connect the tools Clawvio can read from and act inside.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {apps.map((app) => {
                  const Icon = APP_ICON_BY_ID[app.id] ?? Circle;
                  const provider = providerForApp(app.id);
                  const isGoogleApp = provider === "google";
                  const isBusy = connectingProvider === provider;
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        const url = urlForApp(app.id);
                        if (url) window.open(url, "_blank");
                      }}
                      className="group rounded-lg border border-brand-dark/10 bg-white p-4 cursor-pointer hover:border-brand-dark/30 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="h-10 w-10 rounded-md bg-[#ebe9e4] flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full mt-1.5",
                            app.connected ? "bg-emerald-500" : "bg-brand-dark/20",
                          ].join(" ")}
                        />
                      </div>
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold">{app.label}</h3>
                        <p className="mt-1 min-h-10 text-xs leading-5 text-brand-text/65">
                          {app.connected
                            ? "Ready for assistant workflows."
                            : isGoogleApp
                              ? "Connect Google once to unlock this app."
                              : "OAuth setup is pending."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          connectApp(provider);
                        }}
                        disabled={isBusy}
                        className={[
                          "mt-4 h-9 w-full rounded-md border px-3 text-sm font-semibold transition disabled:opacity-60",
                          app.connected
                            ? "border-brand-dark/10 bg-[#f5f3ef] text-brand-dark hover:bg-[#ebe9e4]"
                            : "border-brand-dark bg-brand-dark text-white hover:bg-black",
                        ].join(" ")}
                      >
                        {isBusy ? "Starting..." : app.connected ? "Reconnect" : "Connect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>}

            {(view === "dashboard" || view === "runs" || view === "connections") && <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-7">
              {(view === "dashboard" || view === "runs") && (
              <section className="rounded-lg border border-brand-dark/10 bg-white lg:col-span-4">
                <div className="border-b border-brand-dark/10 p-4">
                  <h2 className="font-semibold">Recent Runs</h2>
                  <p className="text-sm text-brand-text/65">Latest assistant activity.</p>
                </div>
                <div>
                  <div className="hidden md:grid grid-cols-[1fr_90px_90px_120px] gap-4 border-b border-brand-dark/10 px-4 py-3 text-xs font-semibold text-brand-text/55">
                    <span>Request</span>
                    <span>Status</span>
                    <span>Duration</span>
                    <span>Started</span>
                  </div>
                  {loading && (
                    <div className="px-4 py-8 text-sm text-brand-text/65">Loading recent runs...</div>
                  )}
                  {!loading && runs.length === 0 && (
                    <div className="px-4 py-10 text-sm text-brand-text/65">
                      No runs yet. New assistant requests will appear here.
                    </div>
                  )}
                  {!loading &&
                    runs.map((run) => (
                      <div
                        key={run.id}
                        className="grid grid-cols-1 md:grid-cols-[1fr_90px_90px_120px] gap-2 md:gap-4 border-b border-brand-dark/5 px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {shortTranscript(run.transcript)}
                          </p>
                          {run.message && (
                            <p className="truncate text-xs text-brand-text/60">{run.message}</p>
                          )}
                        </div>
                        <span className="text-sm text-brand-text/75">
                          {run.success === true ? "Done" : run.success === false ? "Failed" : "Running"}
                        </span>
                        <span className="text-sm text-brand-text/75">
                          {prettyDuration(run.durationMs)}
                        </span>
                        <span className="text-sm text-brand-text/75">{formatDate(run.startedAt)}</span>
                      </div>
                    ))}
                </div>
              </section>
              )}

              {(view === "dashboard" || view === "connections") && (
              <section className="rounded-lg border border-brand-dark/10 bg-white lg:col-span-3">
                <div className="border-b border-brand-dark/10 p-4">
                  <h2 className="font-semibold">Connected Apps</h2>
                  <p className="text-sm text-brand-text/65">
                    Google scopes plus upcoming integrations.
                  </p>
                </div>
                <div className="divide-y divide-brand-dark/10">
                  {apps.map((app) => {
                    const Icon = APP_ICON_BY_ID[app.id] ?? Circle;
                    return (
                      <div key={app.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-9 w-9 rounded-md bg-[#ebe9e4] flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{app.label}</p>
                          <p className="text-xs text-brand-text/60">
                            {app.connected ? "Connected" : "Not connected"}
                          </p>
                        </div>
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full",
                            app.connected ? "bg-emerald-500" : "bg-brand-dark/20",
                          ].join(" ")}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
              )}
            </div>}

            {view === "data" && (
              <div className="mt-4 grid gap-4 lg:grid-cols-7">
                <section className="rounded-lg border border-brand-dark/10 bg-white lg:col-span-3">
                  <div className="border-b border-brand-dark/10 p-4">
                    <h2 className="font-semibold">Contacts</h2>
                    <p className="text-sm text-brand-text/65">
                      People Clawvio can resolve from voice requests.
                    </p>
                  </div>
                  <div className="divide-y divide-brand-dark/10">
                    {loading && (
                      <div className="px-4 py-8 text-sm text-brand-text/65">Loading contacts...</div>
                    )}
                    {!loading && contacts.length === 0 && (
                      <div className="px-4 py-8 text-sm text-brand-text/65">
                        No contacts yet. Mention or dictate an email address in a request to auto-capture it.
                      </div>
                    )}
                    {!loading &&
                      contacts.map((contact) => (
                        <div key={contact.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="h-9 w-9 rounded-md bg-[#ebe9e4] flex items-center justify-center">
                            <Users2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{contact.display_name}</p>
                            <p className="truncate text-xs text-brand-text/60">
                              {contact.primary_email ?? "No email saved"}
                            </p>
                            {(contact.organization || contact.role) && (
                              <p className="truncate text-xs text-brand-text/55">
                                {[contact.role, contact.organization].filter(Boolean).join(" at ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>

                <section className="rounded-lg border border-brand-dark/10 bg-white lg:col-span-4">
                  <div className="border-b border-brand-dark/10 p-4">
                    <h2 className="font-semibold">Vector Memory</h2>
                    <p className="text-sm text-brand-text/65">
                      Stored transcript memory, ready for embeddings and semantic retrieval.
                    </p>
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-3">
                    {[
                      { label: "Contacts", value: summary?.dataStats.contacts ?? 0 },
                      { label: "Memories", value: summary?.dataStats.memories ?? 0 },
                      { label: "Vector-ready", value: summary?.dataStats.vectorReady ?? 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-md bg-[#f5f3ef] p-3">
                        <p className="text-xs text-brand-text/60">{stat.label}</p>
                        <p className="mt-1 text-xl font-bold">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 pb-4">
                    <div className="relative h-36 overflow-hidden rounded-lg border border-brand-dark/10 bg-[#f7f4ee]">
                      <div className="absolute left-8 top-8 h-16 w-16 rounded-full border border-brand-dark/15 bg-white" />
                      <div className="absolute left-28 top-16 h-10 w-10 rounded-full border border-brand-dark/15 bg-white" />
                      <div className="absolute right-16 top-7 h-20 w-20 rounded-full border border-brand-dark/15 bg-white" />
                      <div className="absolute inset-x-8 top-1/2 h-px bg-brand-dark/10" />
                      <div className="absolute bottom-4 left-4 text-xs font-semibold text-brand-text/55">
                        memory clusters
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-brand-dark/10 border-t border-brand-dark/10">
                    {loading && (
                      <div className="px-4 py-8 text-sm text-brand-text/65">Loading memories...</div>
                    )}
                    {!loading && memoryItems.length === 0 && (
                      <div className="px-4 py-8 text-sm text-brand-text/65">
                        No memory items yet. Voice runs will be stored here.
                      </div>
                    )}
                    {!loading &&
                      memoryItems.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <span className="rounded-full bg-[#ebe9e4] px-2 py-1 text-[11px] text-brand-text/65">
                              {item.kind}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-brand-text/65">
                            {item.body}
                          </p>
                        </div>
                      ))}
                  </div>
                </section>
              </div>
            )}

            {view === "settings" && (
              <section className="mt-4 rounded-lg border border-brand-dark/10 bg-white p-5">
                <h2 className="font-semibold">Settings</h2>
                <p className="mt-1 text-sm text-brand-text/65">
                  Profile, notification, and workspace preferences will live here.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
