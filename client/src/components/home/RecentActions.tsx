import { Calendar, CheckCircle2, Clock, Mail, Search } from "lucide-react";

type ActionHistoryItem = {
  id: number;
  title: string;
  description: string;
  time: string;
  icon: JSX.Element;
  bgColor: string;
  borderColor: string;
};

const ACTION_HISTORY: ActionHistoryItem[] = [
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

export function RecentActions() {
  return (
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
            <div className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-full border", action.bgColor, action.borderColor].join(" ")}>
              {action.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-slate-900">{action.title}</h4>
                <span className="text-xs font-medium text-slate-400">{action.time}</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{action.description}</p>
            </div>

            <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
