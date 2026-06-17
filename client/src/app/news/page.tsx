import FadeIn from "@/landing/components/FadeIn";
import MarketingShell from "@/landing/components/MarketingShell";
import { newsItems } from "@/landing/data/content";

export default function NewsPage() {
  return (
    <MarketingShell>
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 pb-24">
        <section className="pb-16 text-center">
          <FadeIn>
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              News
            </span>
            <h1 className="text-5xl md:text-7xl lg:text-[6rem] leading-[1.1] font-serif text-brand-dark tracking-tight mb-8">
              Product notes, company updates, and automation thinking.
            </h1>
            <p className="text-lg md:text-xl text-brand-text/80 max-w-2xl mx-auto leading-relaxed">
              Follow what we are learning as Clawvio connects more tools, teams,
              and operational workflows.
            </p>
          </FadeIn>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {newsItems.map((item, index) => (
            <FadeIn
              key={item.id}
              delay={index * 0.08}
              className="bg-[#F9F8F6] rounded-2xl overflow-hidden border border-brand-dark/5"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={item.image}
                  alt={item.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute top-5 right-5 bg-white/90 backdrop-blur-sm text-brand-dark text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full">
                  {item.category}
                </div>
              </div>
              <div className="p-6 md:p-8">
                <span className="text-xs text-brand-text/50">{item.date}</span>
                <h2 className="text-2xl font-serif text-brand-dark mt-2 mb-3">
                  {item.title}
                </h2>
                <p className="text-sm leading-relaxed text-brand-text/70">
                  {item.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </section>
      </div>
    </MarketingShell>
  );
}
