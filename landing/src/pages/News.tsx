import React from 'react';
import { newsItems } from '../data/content';
import ContentCard from '../components/ContentCard';
import FadeIn from '../components/FadeIn';
import ContactSection from '../components/ContactSection';

const News = () => {
  const containerClass = "w-full max-w-[1400px] mx-auto px-4 md:px-8";

  return (
    <div className="flex flex-col w-full pt-32">
      {/* Header */}
      <section className={`${containerClass} mb-20`}>
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            News & Insights
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="text-5xl md:text-7xl font-serif text-brand-dark tracking-tight mb-8 leading-[1.1]">
                Latest from <br />
                <span className="italic text-brand-text/40">the</span> industry.
              </h1>
            </div>
            <div className="lg:pl-12 pb-2">
              <p className="text-lg text-brand-text/80 leading-relaxed max-w-md">
                Stay updated with the latest trends in AI, company announcements, and thought leadership from our team.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Grid */}
      <section className={`${containerClass} mb-32`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-16">
          {newsItems.map((item, index) => (
            <ContentCard 
              key={item.id}
              {...item}
              basePath="/news"
              index={index}
            />
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className={`${containerClass} pb-24`}>
        <ContactSection />
      </section>
    </div>
  );
};

export default News;
