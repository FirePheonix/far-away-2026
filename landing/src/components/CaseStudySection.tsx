import FadeIn from "./FadeIn";
import assets from "../data/assets.json";

const CaseStudySection = () => {
  return (
    <div className="py-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Content */}
        <div className="lg:col-span-5">
          <FadeIn>
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              Case study
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-6">
              We help automate <br />
              what matters{" "}
              <span className="italic text-brand-text/50">most.</span>
            </h2>
            <p className="text-brand-text mb-8 text-sm leading-relaxed">
              Hamilton, a growing e-commerce business, was overwhelmed by
              repetitive order processing and customer support tasks.
              <br />
              <br />
              We analyzed their workflows, identified high-impact opportunities,
              and built custom automation that integrated seamlessly with their
              existing tools.
              <br />
              <br />
              Within 30 days, they saw measurable results.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#EBE9E4]/50 p-6 rounded-2xl">
                <span className="block text-3xl font-serif text-brand-dark mb-1">
                  50+
                </span>
                <span className="text-xs font-medium text-brand-text/70 uppercase tracking-wide block mb-1">
                  Hours saved
                </span>
                <span className="text-[10px] text-brand-text/50">
                  In the first month
                </span>
              </div>
              <div className="bg-[#EBE9E4]/50 p-6 rounded-2xl">
                <span className="block text-3xl font-serif text-brand-dark mb-1">
                  40%
                </span>
                <span className="text-xs font-medium text-brand-text/70 uppercase tracking-wide block mb-1">
                  Reduction
                </span>
                <span className="text-[10px] text-brand-text/50">
                  In manual work
                </span>
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Right Image */}
        <div className="lg:col-span-7">
          <FadeIn
            delay={0.2}
            className="relative aspect-[4/5] md:aspect-square lg:aspect-[4/5] rounded-[2.5rem] overflow-hidden"
          >
            <img
              src={assets.vercel.sections.case_study_hamilton}
              alt="Hamilton Case Study"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Logo Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white text-3xl font-serif flex items-center gap-2">
                <span className="text-4xl">*</span> Hamilton
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default CaseStudySection;
