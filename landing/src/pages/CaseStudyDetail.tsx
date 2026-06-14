import React, { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { caseStudies } from '../data/content';
import FadeIn from '../components/FadeIn';
import ContactSection from '../components/ContactSection';

const CaseStudyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const study = caseStudies.find(s => s.id === id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!study) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-serif mb-4">Case Study Not Found</h2>
          <Link to="/case-studies" className="text-brand-dark underline">Back to Case Studies</Link>
        </div>
      </div>
    );
  }

  const containerClass = "w-full max-w-[1400px] mx-auto px-4 md:px-8";

  return (
    <div className="flex flex-col w-full pt-32">
      {/* Navigation */}
      <div className={containerClass}>
        <Link 
          to="/case-studies" 
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-dark bg-white border border-brand-dark/10 px-4 py-2 rounded-full hover:bg-brand-dark hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      {/* Hero Section */}
      <section className={`${containerClass} mb-24`}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full aspect-[16/9] md:aspect-[2.4/1] rounded-[2.5rem] overflow-hidden"
        >
          <img 
            src={study.image} 
            alt={study.title} 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
          
          <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 lg:px-24">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-5xl md:text-7xl lg:text-8xl font-serif text-white mb-6"
            >
              {study.title}
            </motion.h1>
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-white/90 text-lg md:text-xl max-w-xl leading-relaxed"
            >
              {study.description}
            </motion.p>
          </div>
        </motion.div>
      </section>

      {/* Content Sections */}
      <section className={`${containerClass} mb-24`}>
        <div className="max-w-4xl mx-auto space-y-24">
          
          {/* The Challenge */}
          <FadeIn className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16">
            <div className="md:col-span-4">
              <h3 className="text-sm font-medium text-brand-text/50 uppercase tracking-wide sticky top-32">The Challenge</h3>
            </div>
            <div className="md:col-span-8">
              <h2 className="text-2xl md:text-3xl font-serif text-brand-dark mb-6 leading-tight">
                {study.title} needed to automate their inventory tracking and supplier coordination processes that were causing stockouts and overstocking issues.
              </h2>
              <p className="text-brand-text leading-relaxed">
                Manual inventory management across multiple suppliers and warehouses was creating errors, food waste, and customer complaints about missing items or delayed deliveries. The team was spending over 40 hours a week just reconciling spreadsheets.
              </p>
            </div>
          </FadeIn>

          {/* Our Strategy */}
          <FadeIn className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16">
            <div className="md:col-span-4">
              <h3 className="text-sm font-medium text-brand-text/50 uppercase tracking-wide sticky top-32">Our Strategy</h3>
            </div>
            <div className="md:col-span-8">
              <h2 className="text-2xl md:text-3xl font-serif text-brand-dark mb-6 leading-tight">
                We built predictive inventory systems that automatically tracked stock levels and forecasted demand based on order patterns.
              </h2>
              <p className="text-brand-text leading-relaxed">
                Our automation integrated real-time data from sales, warehouses, and suppliers to create a seamless supply chain that reduced waste and improved delivery reliability. We also implemented an automated alert system for low stock levels.
              </p>
            </div>
          </FadeIn>

          {/* The Results */}
          <FadeIn className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16">
            <div className="md:col-span-4">
              <h3 className="text-sm font-medium text-brand-text/50 uppercase tracking-wide sticky top-32">The Results</h3>
            </div>
            <div className="md:col-span-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {study.stats.map((stat, idx) => (
                  <div key={idx} className="bg-[#EBE9E4]/50 p-6 rounded-2xl">
                    <span className="block text-4xl font-serif text-brand-dark mb-2">{stat.value}</span>
                    <span className="text-xs font-medium text-brand-text/70 uppercase tracking-wide">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

        </div>
      </section>

      {/* Contact Section */}
      <section className={`${containerClass} pb-24`}>
        <ContactSection />
      </section>
    </div>
  );
};

export default CaseStudyDetail;
