import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LegalLayoutProps {
  title: string;
  date: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({ title, date, children }) => {
  return (
    <div className="min-h-screen bg-brand-bg pt-32 pb-24">
      <div className="w-full max-w-[800px] mx-auto px-4 md:px-8">
        {/* Back Button */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-dark/60 hover:text-brand-dark transition-colors mb-12"
        >
          <ArrowLeft size={16} /> Back to Home
        </Link>

        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16 border-b border-brand-dark/10 pb-12"
        >
          <h1 className="text-4xl md:text-5xl font-serif text-brand-dark mb-4">{title}</h1>
          <p className="text-sm text-brand-text/60">Last updated: {date}</p>
        </motion.div>

        {/* Content */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="prose prose-stone prose-lg max-w-none text-brand-text/80"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
};

export default LegalLayout;
