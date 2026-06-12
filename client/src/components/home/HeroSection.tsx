import { ArrowRight, Command, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative pt-24 pb-32 overflow-hidden">
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
  );
}
