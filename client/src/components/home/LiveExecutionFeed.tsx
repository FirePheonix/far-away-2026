import { Activity } from "lucide-react";

type LiveLog = {
  id: number;
  time: string;
  message: string;
  status: "pending" | "success" | "active";
};

const LIVE_LOGS: LiveLog[] = [
  { id: 1, time: "16:45:02", message: "Listening for voice input...", status: "pending" },
  { id: 2, time: "16:45:05", message: "Transcription received: 'Schedule a meeting with the winner from Hackathon Winners tomorrow at 5pm'", status: "success" },
  { id: 3, time: "16:45:06", message: "Planner: Analyzing request and selecting tools...", status: "success" },
  { id: 4, time: "16:45:07", message: "Executing tool: sheets.get_last_row(sheetName: 'Hackathon Winners')", status: "success" },
  { id: 5, time: "16:45:08", message: "Tool success: Found row { name: 'Alice Smith', email: 'alice@example.com' }", status: "success" },
  { id: 6, time: "16:45:08", message: "Executing tool: meet.create_link()", status: "success" },
  { id: 7, time: "16:45:09", message: "Tool success: Generated link https://meet.google.com/abc-defg-hij", status: "success" },
  { id: 8, time: "16:45:09", message: "Executing tool: calendar.create_event(title: 'Meeting with Hackathon Winner', start: '2024-12-05T17:00:00Z')", status: "active" },
];

export function LiveExecutionFeed() {
  return (
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
              <div className={["flex-1 leading-relaxed", log.status === "active" ? "text-blue-700 font-medium" : "text-slate-600"].join(" ")}>
                {log.message}
              </div>
              <div className="w-16 text-right shrink-0 mt-0.5">
                {log.status === "success" && <span className="text-emerald-500">Done</span>}
                {log.status === "active" && <span className="text-blue-600 animate-pulse">Wait</span>}
                {log.status === "pending" && <span className="text-slate-400">...</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
