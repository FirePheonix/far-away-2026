/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import FadeIn from "./FadeIn";
import Image from "next/image";
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
        {/* Card 1: Typical Setup */}
        <FadeIn className="group flex flex-col">
          <div className="relative w-full h-[320px] lg:h-[400px] rounded-[2rem] overflow-hidden mb-8 border border-brand-dark/5 bg-gray-50 transition-all duration-500 group-hover:shadow-xl group-hover:shadow-black/5">
            <Image
              src="/Typical-setup.png"
              alt="Fragmented Stack"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors duration-500" />
          </div>
          
          <div className="flex flex-col px-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 text-sm">
                ✕
              </span>
              <h3 className="text-2xl font-serif text-brand-dark">Typical setup</h3>
            </div>
            
            <p className="text-brand-text/70 mb-8 text-sm leading-relaxed max-w-sm">
              Work is scattered across multiple apps. Your team spends hours context switching, hunting down lost decisions, and manually coordinating tasks.
            </p>
            
            <div className="flex flex-wrap gap-2 mt-auto">
              {[
                "Context switching",
                "Manual follow-ups",
                "Lost decisions",
                "No run visibility",
              ].map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] font-semibold uppercase tracking-wider bg-[#EBE9E4] text-brand-dark/60 px-3 py-1.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Card 2: Clawvio OS */}
        <FadeIn
          delay={0.2}
          className="group flex flex-col"
        >
          <div className="relative w-full h-[320px] lg:h-[400px] rounded-[2rem] overflow-hidden mb-8 border border-brand-dark/10 bg-[#F9F8F6] transition-all duration-500 group-hover:shadow-xl group-hover:shadow-brand-dark/10 group-hover:border-brand-dark/20">
            <Image
              src="/clawvio_overlay_animated.svg"
              alt="Clawvio OS"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-orange-500/5 mix-blend-overlay pointer-events-none" />
          </div>
          
          <div className="flex flex-col px-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-50 text-green-700 text-sm">
                ✓
              </span>
              <h3 className="text-2xl font-serif text-brand-dark">Clawvio</h3>
            </div>
            
            <p className="text-brand-text/70 mb-8 text-sm leading-relaxed max-w-sm">
              One intelligent interface to execute across your stack. Every result is stored as reusable memory, building a compounding knowledge base.
            </p>
            
            <div className="flex flex-wrap gap-2 mt-auto">
              {[
                "Natural language control",
                "Cross-app execution",
                "Run history",
                "Growing knowledge base",
              ].map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] font-semibold uppercase tracking-wider bg-brand-dark text-white px-3 py-1.5 rounded-full shadow-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
};

export default ComparisonSection;
