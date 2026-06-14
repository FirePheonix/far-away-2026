/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { motion } from "framer-motion";
import { Star, Play } from "lucide-react";
import Link from "next/link";

const IntroHeader = () => {
  return (
    <div className="w-full flex flex-col items-center text-center pt-10 pb-12">
      {/* Rating */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-2 mb-8"
      >
        {/* <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={14}
              className="fill-[#D4C5A8] text-[#D4C5A8]"
            />
          ))}
        </div>
        <span className="text-xs font-medium text-brand-text/80 tracking-wide">
          Helped over 100+ businesses
        </span> */}
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.1] font-serif font-semibold text-gradient-down tracking-tight mb-6 max-w-4xl"
      >
        An operating system powered by conversation.
      </motion.h1>

      {/* Subtext */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="text-lg text-brand-text/80 leading-relaxed max-w-2xl mb-10"
      >
        Clawvio connects your meetings, calendars, notes, and tasks into one intelligent workflow.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="flex flex-col sm:flex-row items-center gap-4"
      >
        <Link
          href="/book-call"
          className="bg-brand-dark text-white text-sm font-medium px-8 py-3.5 rounded-full hover:bg-black transition-transform hover:scale-105 active:scale-95 duration-300"
        >
          Book a free call
        </Link>
        <Link
          href="/about"
          className="bg-[#EBE9E4] text-brand-dark text-sm font-medium px-6 py-3.5 rounded-full hover:bg-[#E0DED9] transition-all hover:scale-105 active:scale-95 duration-300 flex items-center gap-2 group"
        >
          How we work
          <span className="bg-brand-dark text-white rounded-full p-0.5 group-hover:bg-black transition-colors">
            <Play size={10} fill="currentColor" className="ml-0.5" />
          </span>
        </Link>
      </motion.div>
    </div>
  );
};

export default IntroHeader;

