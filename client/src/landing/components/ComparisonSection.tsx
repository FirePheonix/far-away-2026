/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import FadeIn from "./FadeIn";
import assets from "../data/assets.json";

const ComparisonSection = () => {
  return (
    <div className="py-24">
      <div className="text-center mb-16">
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            Why Clawvio
          </span>
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark">
            From scattered tools to one {" "}
            <span className="italic text-brand-text/50">conversation OS</span>.
          </h2>
          <p className="mt-6 text-brand-text max-w-lg mx-auto">
            Most teams have AI tools. Few have reliable execution plus a memory
            layer that gets better after every run.
          </p>
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FadeIn className="relative h-[400px] rounded-[2rem] overflow-hidden group">
          <img
            src={assets.vercel.sections.comparison_other}
            alt="Fragmented Stack"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative z-10 h-full p-8 flex flex-col justify-between text-white">
            <div className="flex gap-2 flex-wrap">
              {[
                "Context switching",
                "Manual follow-ups",
                "Lost decisions",
                "No run visibility",
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
              <h3 className="text-3xl font-serif mb-2">Typical setup</h3>
              <p className="text-sm text-white/70 max-w-xs mx-auto">
                Work is spread across many apps, and teams still rely on manual
                coordination to keep things moving.
              </p>
            </div>
          </div>
        </FadeIn>

        <FadeIn
          delay={0.2}
          className="relative h-[400px] rounded-[2rem] overflow-hidden group"
        >
          <img
            src={assets.vercel.sections.comparison_jane}
            alt="Clawvio OS"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-orange-500/20 mix-blend-overlay" />

          <div className="relative z-10 h-full p-8 flex flex-col justify-between text-white">
            <div className="flex gap-2 flex-wrap">
              {[
                "Natural language control",
                "Cross-app execution",
                "Run history",
                "Growing knowledge base",
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
              <h3 className="text-3xl font-serif mb-2">Clawvio</h3>
              <p className="text-sm text-white/90 max-w-xs mx-auto font-medium">
                One interface to execute across your stack, with every result
                stored as reusable operational memory.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
};

export default ComparisonSection;
