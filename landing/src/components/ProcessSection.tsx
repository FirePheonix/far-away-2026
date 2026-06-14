import FadeIn from "./FadeIn";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    id: "01",
    title: "Discovery & Assessment",
    tag: "Week 1",
    description:
      "We analyze your workflows and identify where automation creates the most value for your business.",
  },
  {
    id: "02",
    title: "Build & Deploy",
    tag: "Weeks 2-4",
    description:
      "We create and launch custom systems tailored to your operations without disrupting daily work.",
  },
  {
    id: "03",
    title: "Train & Support",
    tag: "Ongoing",
    description:
      "We train your team and provide ongoing support to keep your automation running smoothly.",
  },
];

const ProcessSection = () => {
  return (
    <div className="py-24 border-t border-brand-dark/5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Left Content */}
        <div className="lg:col-span-5">
          <FadeIn>
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              How we work
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-6 leading-tight">
              Getting you results <br />
              <span className="italic text-brand-text/50">without</span> the
              complexity.
            </h2>
            <p className="text-brand-text mb-8 max-w-md">
              Our three-step process takes you from identifying opportunities to
              launching systems, with clear communication and support at every
              stage.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                to="/book-call"
                className="bg-brand-dark text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-black transition-transform hover:scale-105 active:scale-95 duration-300"
              >
                Book a free call
              </Link>
              <button
                className="bg-[#EBE9E4] text-brand-dark text-sm font-medium px-6 py-3 rounded-full hover:bg-[#E0DED9] transition-all hover:scale-105 active:scale-95 duration-300 flex items-center gap-2 group"
                name="watch-video"
              >
                Watch the video
                <span className="bg-brand-dark text-white rounded-full p-0.5 group-hover:bg-black transition-colors">
                  <Play size={8} fill="currentColor" className="ml-0.5" />
                </span>
              </button>
            </div>
          </FadeIn>
        </div>

        {/* Right Steps */}
        <div className="lg:col-span-7 flex flex-col gap-12 pt-8">
          {steps.map((step, idx) => (
            <FadeIn
              key={step.id}
              delay={idx * 0.1}
              className="flex gap-6 md:gap-12 group"
            >
              <span className="text-xl font-serif text-brand-text/30 pt-1">
                {step.id}
              </span>
              <div className="flex-1 pb-12 border-b border-brand-dark/5 group-last:border-0">
                <div className="flex items-center gap-4 mb-3">
                  <h3 className="text-xl font-medium text-brand-dark">
                    {step.title}
                  </h3>
                  <span className="text-[10px] uppercase tracking-wider bg-white border border-brand-dark/10 px-2 py-1 rounded text-brand-text/60">
                    {step.tag}
                  </span>
                </div>
                <p className="text-brand-text/80 max-w-lg leading-relaxed">
                  {step.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProcessSection;
