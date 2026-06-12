import { StatusPill } from "@/components/status-pill";
import { fetchLandingStatus } from "@/lib/api/status";
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Command,
  Mail,
  MessageSquare,
  Search,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";

// Mock data for the Live Logs
const LIVE_LOGS = [
  { id: 1, time: "16:45:02", message: "Listening for voice input...", status: "pending" },
  { id: 2, time: "16:45:05", message: "Transcription received: 'Schedule a meeting with the winner from Hackathon Winners tomorrow at 5pm'", status: "success" },
  { id: 3, time: "16:45:06", message: "Planner: Analyzing request and selecting tools...", status: "success" },
  { id: 4, time: "16:45:07", message: "Executing tool: sheets.get_last_row(sheetName: 'Hackathon Winners')", status: "success" },
  { id: 5, time: "16:45:08", message: "Tool success: Found row { name: 'Alice Smith', email: 'alice@example.com' }", status: "success" },
  { id: 6, time: "16:45:08", message: "Executing tool: meet.create_link()", status: "success" },
  { id: 7, time: "16:45:09", message: "Tool success: Generated link https://meet.google.com/abc-defg-hij", status: "success" },
  { id: 8, time: "16:45:09", message: "Executing tool: calendar.create_event(title: 'Meeting with Hackathon Winner', start: '2024-12-05T17:00:00Z')", status: "active" },
];

// Mock data for the Action History
const ACTION_HISTORY = [
  {
    id: 101,
    title: "Scheduled Meeting",
    description: "Meeting with Hackathon Winner tomorrow at 5:00 PM.",
    time: "Just now",
    icon: <Calendar className="h-5 w-5 text-blue-600" />,
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100",
  },
  {
    id: 102,
    title: "Sent Email",
    description: "Follow-up email sent to john.doe@example.com regarding Q3 results.",
    time: "10 mins ago",
    icon: <Mail className="h-5 w-5 text-emerald-600" />,
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-100",
  },
  {
    id: 103,
    title: "Searched Knowledge Base",
    description: "Found 3 articles related to 'product refinement remaining tasks'.",
    time: "1 hour ago",
    icon: <Search className="h-5 w-5 text-purple-600" />,
    bgColor: "bg-purple-50",
    borderColor: "border-purple-100",
  },
];

export default async function Home() {
  let status = null;
  let error: string | undefined;

  try {
    status = await fetchLandingStatus();
  } catch {
    error = "Could not reach API backend";
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 selection:bg-blue-100 font-sans overflow-x-hidden">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 text-white shadow-sm">
              <Command className="h-4 w-4" />
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              Workspace Assistant
            </span>
          </div>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
              <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
              <a href="#demo" className="hover:text-slate-900 transition-colors">Live Demo</a>
              <a href="#docs" className="hover:text-slate-900 transition-colors">Documentation</a>
            </nav>
            <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
            <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">System Status</span>
            </div>
            <StatusPill status={status} error={error} />
          </div>
        </div>
      </header>

      <main>
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative pt-24 pb-32 overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

          <div className="mx-auto max-w-5xl px-6 sm:px-10 relative z-10 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium mb-8">
              <Sparkles className="h-4 w-4" />
              <span>Workspace Assistant v2.0 is live</span>
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-[1.1]">
              Your Autonomous <br />
              <span className="text-blue-600">Engineering Partner</span>
            </h1>
            
            <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-500 mb-10 leading-relaxed">
              Delegate your calendar, email, and knowledge search to an AI that actually understands your workflow. Just speak, and watch it execute in real-time.
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a href="#demo" className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-slate-900 text-white font-medium hover:bg-slate-800 hover:-translate-y-0.5 transition-all shadow-lg hover:shadow-xl">
                Watch Live Demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <a href="#docs" className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-white text-slate-700 border border-slate-200 font-medium hover:bg-slate-50 transition-colors shadow-sm">
                View Documentation
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════════ PRODUCT SHOWCASE (THE DEMO) ═══════════════ */}
        <section id="demo" className="mx-auto max-w-7xl px-6 sm:px-10 pb-32">
          {/* Browser Window Mockup Container */}
          <div className="rounded-2xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
            {/* Window Chrome */}
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400"></div>
                <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                <div className="h-3 w-3 rounded-full bg-emerald-400"></div>
              </div>
              <div className="mx-auto flex items-center justify-center bg-white border border-slate-200 rounded-md px-3 py-1 text-xs text-slate-400 font-medium w-64 shadow-sm">
                <Command className="h-3 w-3 mr-1.5" />
                workspace-assistant.local
              </div>
            </div>

            {/* Dashboard Content */}
            <div className="p-6 sm:p-10 bg-slate-50/50">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
                  Assistant Console
                </h2>
                <p className="text-sm text-slate-500">
                  Monitor real-time task execution and review recently completed automated actions.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* ── LIVE EXECUTION LOGS ── */}
                <div className="lg:col-span-7 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Live Execution Feed
                    </h3>
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                  </div>

                  <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      <div className="w-20">Time</div>
                      <div className="flex-1">Process</div>
                      <div className="w-16 text-right">Status</div>
                    </div>

                    <div className="p-4 overflow-y-auto font-mono text-[13px] space-y-1 max-h-[400px]">
                      {LIVE_LOGS.map((log) => (
                        <div
                          key={log.id}
                          className={["flex items-start gap-3 p-2 rounded-md transition-colors", log.status === "active" ? "bg-blue-50/50" : "hover:bg-slate-50"].join(" ")}
                        >
                          <div className="w-20 text-slate-400 shrink-0 mt-0.5">[{log.time}]</div>
                          <div
                            className={["flex-1 leading-relaxed", log.status === "active" ? "text-blue-700 font-medium" : "text-slate-600"].join(" ")}
                          >
                            {log.message}
                          </div>
                          <div className="w-16 text-right shrink-0 mt-0.5">
                            {log.status === "success" && (
                              <span className="text-emerald-500">Done</span>
                            )}
                            {log.status === "active" && (
                              <span className="text-blue-600 animate-pulse">Wait</span>
                            )}
                            {log.status === "pending" && (
                              <span className="text-slate-400">...</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── RECENT ACTION LOGS ── */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-500" />
                      Recent Actions
                    </h3>
                  </div>

                  <div className="flex-1 space-y-3">
                    {ACTION_HISTORY.map((action) => (
                      <div
                        key={action.id}
                        className="group relative flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 cursor-default"
                      >
                        <div
                          className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-full border", action.bgColor, action.borderColor].join(" ")}
                        >
                          {action.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold text-slate-900">{action.title}</h4>
                            <span className="text-xs font-medium text-slate-400">
                              {action.time}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {action.description}
                          </p>
                        </div>
                        
                        {/* Subtle success indicator on hover */}
                        <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
                           <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ FEATURES GRID ═══════════════ */}
        <section id="features" className="bg-white border-t border-slate-200 py-32">
          <div className="mx-auto max-w-7xl px-6 sm:px-10">
            <div className="text-center max-w-2xl mx-auto mb-20">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Built for Engineering Velocity</h2>
              <p className="text-lg text-slate-500">Stop switching contexts. Let the assistant handle the busywork so you can stay in the flow.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Smart Calendar Ops",
                  desc: "Automatically finds free slots, resolves conflicts, and generates Meet links without you ever opening Google Calendar.",
                  icon: <Calendar className="h-6 w-6 text-blue-600" />,
                  bg: "bg-blue-50"
                },
                {
                  title: "Intelligent Comms",
                  desc: "Drafts and sends emails, searches past threads, and replies contextually based on your instructions.",
                  icon: <Mail className="h-6 w-6 text-emerald-600" />,
                  bg: "bg-emerald-50"
                },
                {
                  title: "Knowledge Retrieval",
                  desc: "Pulls data directly from your Google Sheets, finding emails, reading rows, and injecting context into workflows.",
                  icon: <Zap className="h-6 w-6 text-amber-600" />,
                  bg: "bg-amber-50"
                }
              ].map((feature, i) => (
                <div key={i} className="p-8 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xl transition-all duration-300">
                  <div className={["h-12 w-12 rounded-xl flex items-center justify-center mb-6", feature.bg].join(" ")}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      
      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-50 border-t border-slate-200 py-12">
        <div className="mx-auto max-w-7xl px-6 sm:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <Command className="h-5 w-5" />
            <span>Workspace Assistant</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 Workspace Assistant. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
