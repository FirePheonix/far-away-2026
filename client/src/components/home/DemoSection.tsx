import { Command } from "lucide-react";
import { LiveExecutionFeed } from "@/components/home/LiveExecutionFeed";
import { RecentActions } from "@/components/home/RecentActions";

export function DemoSection() {
  return (
    <section id="demo" className="mx-auto max-w-7xl px-6 sm:px-10 pb-32">
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
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

        <div className="p-6 sm:p-10 bg-slate-50/50">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">Assistant Console</h2>
            <p className="text-sm text-slate-500">
              Monitor real-time task execution and review recently completed automated actions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <LiveExecutionFeed />
            <RecentActions />
          </div>
        </div>
      </div>
    </section>
  );
}
