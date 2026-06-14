import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 md:px-12 md:py-6 max-w-[1400px] mx-auto w-full bg-brand-bg/80 backdrop-blur-sm"
    >
      {/* 1. Navigation Links (Left) */}
      {/* Mobile: Visible, inline, no hamburger. Adjusted gap and text size for fit. */}
      <div className="flex items-center gap-2 sm:gap-4 md:gap-8 text-[11px] sm:text-xs md:text-sm font-medium text-brand-dark/80">
        <Link
          to="/about"
          className="hover:text-brand-dark transition-colors p-1"
        >
          About
        </Link>
        <Link
          to="/case-studies"
          className="hover:text-brand-dark transition-colors whitespace-nowrap p-1"
        >
          Case Studies
        </Link>
        <Link
          to="/news"
          className="hover:text-brand-dark transition-colors p-1"
        >
          News
        </Link>
      </div>

      {/* 2. Logo (Right on Mobile, Center on Desktop) */}
      {/* Desktop: Absolute center. Mobile: Relative right (via justify-between) */}
      <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 shrink-0">
        <Link
          to="/"
          className="text-xl sm:text-2xl md:text-4xl font-serif tracking-tight text-brand-dark"
        >
          Jane
        </Link>
      </div>

      {/* 3. CTA (Hidden on Mobile) */}
      <div className="hidden md:block">
        <Link
          to="/book-call"
          className="bg-brand-primary text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-black transition-all hover:scale-105 active:scale-95 duration-300"
        >
          Book a free call
        </Link>
      </div>
    </motion.nav>
  );
};

export default Navbar;
