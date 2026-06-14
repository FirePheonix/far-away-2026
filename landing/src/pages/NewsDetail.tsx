import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { newsItems } from '../data/content';
import FadeIn from '../components/FadeIn';
import ContactSection from '../components/ContactSection';

const NewsDetail = () => {
  const { id } = useParams<{ id: string }>();
  const newsItem = newsItems.find(n => n.id === id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!newsItem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-serif mb-4">Article Not Found</h2>
          <Link to="/news" className="text-brand-dark underline">Back to News</Link>
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
          to="/news" 
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
            src={newsItem.image} 
            alt={newsItem.title} 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
          
          <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 lg:px-24">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-4 flex items-center gap-3"
            >
              <span className="bg-white/20 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/20">
                {newsItem.category}
              </span>
              <span className="text-white/80 text-sm">{newsItem.date}</span>
            </motion.div>
            
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-4xl md:text-6xl lg:text-7xl font-serif text-white mb-6 max-w-4xl"
            >
              {newsItem.title}
            </motion.h1>
          </div>
        </motion.div>
      </section>

      {/* Article Content (Static for now, but dynamic in structure) */}
      <section className={`${containerClass} mb-24`}>
        <div className="max-w-3xl mx-auto">
          <FadeIn className="prose prose-lg prose-stone">
            <p className="text-xl text-brand-dark font-serif leading-relaxed mb-8">
              {newsItem.description} This article explores the transformative potential of artificial intelligence in modern business landscapes, focusing on practical applications and strategic implementation.
            </p>
            
            <h3 className="text-2xl font-serif text-brand-dark mt-12 mb-6">The Evolution of Automation</h3>
            <p className="text-brand-text/80 leading-relaxed mb-6">
              As we move further into the digital age, the distinction between manual and automated processes becomes increasingly blurred. Companies that embrace this shift are seeing efficiency gains of up to 40% in their first year of implementation.
            </p>
            <p className="text-brand-text/80 leading-relaxed mb-6">
              However, the challenge lies not in the technology itself, but in the strategy behind it. Successful automation requires a deep understanding of existing workflows and a human-centric approach to design.
            </p>

            <h3 className="text-2xl font-serif text-brand-dark mt-12 mb-6">Looking Ahead</h3>
            <p className="text-brand-text/80 leading-relaxed mb-6">
              The future belongs to organizations that can effectively leverage AI to augment human capability rather than replace it. At Jane, we are committed to building systems that empower teams to do their best work.
            </p>
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

export default NewsDetail;
