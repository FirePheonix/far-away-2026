import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import IntroHeader from '../components/IntroHeader';
import IntroVisual from '../components/IntroVisual';
import IntroLogos from '../components/IntroLogos';
import Hero from '../components/Hero';
import HiringBanner from '../components/HiringBanner';
import Services from '../components/Services';
import Testimonial from '../components/Testimonial';
import ProcessSection from '../components/ProcessSection';
import ComparisonSection from '../components/ComparisonSection';
import CaseStudySection from '../components/CaseStudySection';
import TeamSection from '../components/TeamSection';
import FAQSection from '../components/FAQSection';
import ContactSection from '../components/ContactSection';
import FooterLogos from '../components/FooterLogos';

const Home = () => {
  const containerClass = "w-full max-w-[1400px] mx-auto px-4 md:px-8";
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#faq') {
      const faqSection = document.getElementById('faq');
      if (faqSection) {
        setTimeout(() => {
          faqSection.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location]);

  return (
    <div className="flex flex-col w-full pt-32">
      <section className={containerClass}>
        <IntroHeader />
      </section>

      <section className={`${containerClass} mb-8`}>
        <IntroVisual />
      </section>

      <section className={`${containerClass} mb-24`}>
        <IntroLogos />
      </section>

      <section className={`${containerClass} pb-20`}>
        <Hero />
      </section>
      
      <section className={`${containerClass} mb-32`}>
        <HiringBanner />
      </section>
      
      <section className={`${containerClass} mb-20`}>
        <Services />
      </section>
      
      <section className={`${containerClass} pb-32`}>
        <Testimonial />
      </section>
      
      <section className={`${containerClass} pb-20`}>
        <FooterLogos />
      </section>

      {/* --- EXTENDED SECTIONS --- */}

      <section className={containerClass}>
        <ProcessSection />
      </section>

      <section className={containerClass}>
        <ComparisonSection />
      </section>

      <section className={containerClass}>
        <CaseStudySection />
      </section>

      <section className={containerClass}>
        <TeamSection />
      </section>

      <section id="faq" className={containerClass}>
        <FAQSection />
      </section>

      <section className={`${containerClass} pb-24`}>
        <ContactSection />
      </section>
    </div>
  );
};

export default Home;
