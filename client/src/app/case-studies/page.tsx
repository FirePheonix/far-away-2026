import FadeIn from "@/landing/components/FadeIn";
import MarketingShell from "@/landing/components/MarketingShell";
import { caseStudies } from "@/landing/data/content";

export default function CaseStudiesPage() {
  return (
    <MarketingShell>
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 pb-24">
        <section className="pb-16 text-center">
          <FadeIn>
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              Case Studies
            </span>
            <h1 className="text-5xl md:text-7xl lg:text-[6rem] leading-[1.1] font-serif text-brand-dark tracking-tight mb-8">
              Operations that get lighter with every run.
            </h1>
            <p className="text-lg md:text-xl text-brand-text/80 max-w-2xl mx-auto leading-relaxed">
              Examples of how Clawvio turns scattered app work into repeatable,
              measurable execution loops.
            </p>
          </FadeIn>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {caseStudies.map((study, index) => (
            <FadeIn
              key={study.id}
              delay={index * 0.08}
              className="bg-[#F9F8F6] rounded-2xl overflow-hidden border border-brand-dark/5"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={study.image}
                  alt={study.title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                  <span className="text-white font-serif text-3xl md:text-4xl drop-shadow-md">
                    {study.logoText}
                  </span>
                </div>
              </div>
              <div className="p-6 md:p-8">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-text/50">
                  {study.category}
                </span>
                <h2 className="text-2xl font-serif text-brand-dark mt-2 mb-3">
                  {study.title}
                </h2>
                <p className="text-sm leading-relaxed text-brand-text/70 mb-6">
                  {study.description}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {study.stats.map((stat) => (
                    <div key={stat.label} className="bg-[#EBE9E4]/70 rounded-xl p-3">
                      <div className="text-xl font-serif text-brand-dark">{stat.value}</div>
                      <div className="text-[10px] text-brand-text/60 leading-tight">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </section>
      </div>
    </MarketingShell>
  );
}
