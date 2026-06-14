import { motion } from "framer-motion";
import assets from "../data/assets.json";

const Hero = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="w-full flex flex-col items-center pt-10"
    >
      {/* Top Label */}
      <motion.div variants={itemVariants} className="mb-8">
        <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide">
          Who we are
        </span>
      </motion.div>

      {/* Header Content */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16 items-end">
        <motion.div variants={itemVariants} className="lg:col-span-7">
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] leading-[1] font-serif text-brand-dark tracking-tight">
            The AI agency built for{" "}
            <span className="text-brand-text/40 italic">you.</span>
          </h1>
        </motion.div>

        <motion.div variants={itemVariants} className="lg:col-span-5 pb-2">
          <p className="text-lg text-brand-text leading-relaxed max-w-md ml-auto lg:ml-0">
            We built this agency to help businesses avoid AI overwhelm. We
            listen first, recommend only what works, and build systems you'll
            actually use—without the hype or complexity.
          </p>
        </motion.div>
      </div>

      {/* Metrics Visual */}
      <motion.div
        variants={itemVariants}
        className="w-full relative rounded-[2.5rem] overflow-hidden min-h-[500px] md:min-h-[600px] flex items-center justify-center p-6 md:p-12"
      >
        {/* Background Image - UPDATED */}
        <div className="absolute inset-0 z-0">
          <img
            src={assets.vercel.visuals.hero_bg}
            alt="Abstract Background"
            className="w-full h-full object-cover"
          />
          {/* Subtle overlay for text readability */}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Metrics Cards Container */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
          {/* Card 1 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 text-center text-white shadow-lg flex flex-col items-center justify-center min-h-[220px]">
            <span className="font-serif text-5xl md:text-6xl mb-4 block">
              1,500+
            </span>
            <span className="text-sm md:text-base font-medium opacity-90 tracking-wide">
              Hours saved for clients monthly
            </span>
          </div>

          {/* Card 2 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 text-center text-white shadow-lg flex flex-col items-center justify-center min-h-[220px]">
            <span className="font-serif text-5xl md:text-6xl mb-4 block">
              35%
            </span>
            <span className="text-sm md:text-base font-medium opacity-90 tracking-wide">
              Average reduction in manual work
            </span>
          </div>

          {/* Card 3 */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 text-center text-white shadow-lg flex flex-col items-center justify-center min-h-[220px]">
            <span className="font-serif text-5xl md:text-6xl mb-4 block">
              45 days
            </span>
            <span className="text-sm md:text-base font-medium opacity-90 tracking-wide">
              Average time to measurable ROI
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Hero;
