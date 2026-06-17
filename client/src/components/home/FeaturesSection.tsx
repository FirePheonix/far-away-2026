import { Calendar, Mail, Zap } from "lucide-react";

const FEATURES = [
  {
    title: "Smart Calendar Ops",
    desc: "Automatically finds free slots, resolves conflicts, and generates Meet links without you ever opening Google Calendar.",
    icon: <Calendar className="h-6 w-6 text-blue-600" />,
    bg: "bg-blue-50",
  },
  {
    title: "Intelligent Comms",
    desc: "Drafts and sends emails, searches past threads, and replies contextually based on your instructions.",
    icon: <Mail className="h-6 w-6 text-emerald-600" />,
    bg: "bg-emerald-50",
  },
  {
    title: "Knowledge Retrieval",
    desc: "Pulls data directly from your Google Sheets, finding emails, reading rows, and injecting context into workflows.",
    icon: <Zap className="h-6 w-6 text-amber-600" />,
    bg: "bg-amber-50",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-white border-t border-slate-200 py-32">
      <div className="mx-auto max-w-7xl px-6 sm:px-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Built for Engineering Velocity</h2>
          <p className="text-lg text-slate-500">Stop switching contexts. Let the assistant handle the busywork so you can stay in the flow.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map((feature, i) => (
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
  );
}
