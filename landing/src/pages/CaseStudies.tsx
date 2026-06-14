import { caseStudies } from "../data/content";
import ContentCard from "../components/ContentCard";
import FadeIn from "../components/FadeIn";
import FAQSection from "../components/FAQSection";
import ContactSection from "../components/ContactSection";
import { Play } from "lucide-react";
import assets from "../data/assets.json";

const CaseStudies = () => {
  const containerClass = "w-full max-w-[1400px] mx-auto px-4 md:px-8";

  return (
    <div className="flex flex-col w-full pt-32">
      {/* Header */}
      <section className={`${containerClass} mb-20`}>
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            Case studies
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="text-5xl md:text-7xl font-serif text-brand-dark tracking-tight mb-8 leading-[1.1]">
                Real businesses, <br />
                <span className="italic text-brand-text/40">real</span> results.
              </h1>
              <div className="flex flex-wrap gap-4">
                <button
                  className="bg-brand-dark text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-black transition-transform hover:scale-105 active:scale-95 duration-300"
                  name="book-call"
                >
                  Book a free call
                </button>
                <button
                  className="bg-[#EBE9E4] text-brand-dark text-sm font-medium px-6 py-3 rounded-full hover:bg-[#E0DED9] transition-all hover:scale-105 active:scale-95 duration-300 flex items-center gap-2 group"
                  name="how-we-work"
                >
                  How we work
                  <span className="bg-brand-dark text-white rounded-full p-0.5 group-hover:bg-black transition-colors">
                    <Play size={8} fill="currentColor" className="ml-0.5" />
                  </span>
                </button>
              </div>
            </div>
            <div className="lg:pl-12 pb-2">
              <p className="text-lg text-brand-text/80 leading-relaxed max-w-md">
                See how we've helped companies automate their most
                time-consuming workflows and deliver measurable impact in weeks,
                not months.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Abstract Flower Image (Decorative) */}
        <div className="absolute top-32 right-0 w-1/3 h-[600px] pointer-events-none opacity-50 hidden lg:block -z-10">
          <img
            src={assets.vercel.visuals.decorative_flower}
            alt="Decorative Flower"
            className="w-full h-full object-contain mix-blend-multiply blur-3xl"
          />
        </div>
      </section>

      {/* Grid */}
      <section className={`${containerClass} mb-32`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-16">
          {caseStudies.map((study, index) => (
            <ContentCard
              key={study.id}
              {...study}
              basePath="/case-studies"
              index={index}
            />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className={containerClass}>
        <FAQSection />
      </section>

      {/* Contact */}
      <section className={`${containerClass} pb-24`}>
        <ContactSection />
      </section>
    </div>
  );
};

export default CaseStudies;
