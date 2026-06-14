import FadeIn from "./FadeIn";
import assets from "../data/assets.json";

const ComparisonSection = () => {
  return (
    <div className="py-24">
      <div className="text-center mb-16">
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            Why choose us
          </span>
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark">
            We're not your{" "}
            <span className="italic text-brand-text/50">typical</span> AI
            agency.
          </h2>
          <p className="mt-6 text-brand-text max-w-lg mx-auto">
            We skip the buzzwords and experimental projects to build systems
            that actually work for your business.
          </p>
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Other Agencies */}
        <FadeIn className="relative h-[400px] rounded-[2rem] overflow-hidden group">
          <img
            src={assets.vercel.sections.comparison_other}
            alt="Other Agencies"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative z-10 h-full p-8 flex flex-col justify-between text-white">
            <div className="flex gap-2 flex-wrap">
              {[
                "Sell what's trendy",
                "Unclear timelines",
                "Hidden costs",
                "Sell what's trendy",
              ].map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] uppercase tracking-wide bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="text-center">
              <h3 className="text-3xl font-serif mb-2">Other agencies</h3>
              <p className="text-sm text-white/70 max-w-xs mx-auto">
                Other agencies overwhelm you with buzzwords, take months to
                deliver, and leave you with tools you can't use.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Card 2: Jane */}
        <FadeIn
          delay={0.2}
          className="relative h-[400px] rounded-[2rem] overflow-hidden group"
        >
          <img
            src={assets.vercel.sections.comparison_jane}
            alt="Jane AI"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-orange-500/20 mix-blend-overlay" />

          <div className="relative z-10 h-full p-8 flex flex-col justify-between text-white">
            <div className="flex gap-2 flex-wrap">
              {[
                "Build what matters",
                "Done with you",
                "Transparent process",
                "Real results",
              ].map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] uppercase tracking-wide bg-white/20 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="text-center">
              <h3 className="text-3xl font-serif mb-2">Jane</h3>
              <p className="text-sm text-white/90 max-w-xs mx-auto font-medium">
                At Jane, we use simple language, deliver results in weeks, and
                build systems that work from day one.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
};

export default ComparisonSection;
