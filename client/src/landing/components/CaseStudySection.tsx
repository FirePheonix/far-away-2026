/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import FadeIn from "./FadeIn";
import assets from "../data/assets.json";

const CaseStudySection = () => {
  return (
    <div className="py-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-5">
          <FadeIn>
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              Knowledge base growth
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-6">
              Turn daily operations into <br />
              compounding {" "}
              <span className="italic text-brand-text/50">institutional memory.</span>
            </h2>
            <p className="text-brand-text mb-8 text-sm leading-relaxed">
              Clawvio captures what was requested, what was executed, and what
              changed across your tools.
              <br />
              <br />
              That means decisions are no longer buried in chat threads or
              meetings. They stay searchable, reusable, and connected to outcomes.
              <br />
              <br />
              The more your team uses Clawvio, the smarter your operating memory
              becomes.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#EBE9E4]/50 p-6 rounded-2xl">
                <span className="block text-3xl font-serif text-brand-dark mb-1">
                  3x
                </span>
                <span className="text-xs font-medium text-brand-text/70 uppercase tracking-wide block mb-1">
                  Faster context retrieval
                </span>
                <span className="text-[10px] text-brand-text/50">
                  From past runs and outputs
                </span>
              </div>
              <div className="bg-[#EBE9E4]/50 p-6 rounded-2xl">
                <span className="block text-3xl font-serif text-brand-dark mb-1">
                  100%
                </span>
                <span className="text-xs font-medium text-brand-text/70 uppercase tracking-wide block mb-1">
                  Traceable execution
                </span>
                <span className="text-[10px] text-brand-text/50">
                  Across connected apps
                </span>
              </div>
            </div>
          </FadeIn>
        </div>

        <div className="lg:col-span-7">
          <FadeIn
            delay={0.2}
            className="relative aspect-[4/5] md:aspect-square lg:aspect-[4/5] rounded-[2.5rem] overflow-hidden"
          >
            <img
              src={assets.vercel.sections.case_study_hamilton}
              alt="Knowledge Graph View"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white text-3xl font-serif flex items-center gap-2">
                <span className="text-4xl">*</span> Clawvio Memory
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default CaseStudySection;
