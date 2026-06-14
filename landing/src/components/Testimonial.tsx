import React from 'react';
import { motion } from 'framer-motion';
import assets from '../data/assets.json';

const Testimonial = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[600px] flex items-end p-8 md:p-16"
    >
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={assets.vercel.sections.testimonial_bg} 
          alt="Testimonial Background" 
          className="w-full h-full object-cover"
        />
        {/* Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl">
        <div className="mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white" className="opacity-90">
            <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V11C14.017 11.5523 13.5693 12 13.017 12H12.017V5H22.017V15C22.017 18.3137 19.3307 21 16.017 21H14.017ZM5.0166 21L5.0166 18C5.0166 16.8954 5.91203 16 7.0166 16H10.0166C10.5689 16 11.0166 15.5523 11.0166 15V9C11.0166 8.44772 10.5689 8 10.0166 8H6.0166C5.46432 8 5.0166 8.44772 5.0166 9V11C5.0166 11.5523 4.56889 12 4.0166 12H3.0166V5H13.0166V15C13.0166 18.3137 10.3303 21 7.0166 21H5.0166Z" />
          </svg>
        </div>
        
        <h3 className="text-3xl md:text-4xl lg:text-5xl font-serif text-white leading-tight mb-8">
          They didn't overwhelm us with options. They just built exactly what we needed. We're saving 15 hours a week and saw ROI in under two months.
        </h3>

        <div className="flex flex-col">
          <span className="text-white font-semibold text-lg">Sarah Chen</span>
          <span className="text-white/70 text-sm">Founder at BrightPath Consulting</span>
        </div>
      </div>
    </motion.div>
  );
};

export default Testimonial;
