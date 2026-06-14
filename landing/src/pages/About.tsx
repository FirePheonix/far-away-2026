import React from "react";
import AboutHeader from "../components/AboutHeader";
import AboutValues from "../components/AboutValues";
import TeamSection from "../components/TeamSection";
import HiringBanner from "../components/HiringBanner";
import FAQSection from "../components/FAQSection";
import ContactSection from "../components/ContactSection";
import FooterLogos from "../components/FooterLogos";

const About = () => {
  const containerClass = "w-full max-w-[1400px] mx-auto px-4 md:px-8";

  return (
    <div className="flex flex-col w-full">
      <section className={containerClass}>
        <AboutHeader />
      </section>

      <section className={containerClass}>
        <div className="w-full aspect-[21/9] rounded-[2.5rem] overflow-hidden mb-20 relative">
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2670&auto=compress&fit=crop"
            alt="Jane Team"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>
      </section>

      <section className={containerClass}>
        <AboutValues />
      </section>

      <section className={containerClass}>
        <TeamSection />
      </section>

      <section className={`${containerClass} mb-24 mt-12`}>
        <HiringBanner />
      </section>

      <section className={containerClass}>
        <FAQSection />
      </section>

      <section className={`${containerClass} pb-20`}>
        <FooterLogos />
      </section>

      <section className={`${containerClass} pb-24`}>
        <ContactSection />
      </section>
    </div>
  );
};

export default About;
