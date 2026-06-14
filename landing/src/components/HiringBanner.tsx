import { motion } from "framer-motion";

const HiringBanner = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="w-full"
    >
      <div className="bg-[#F2F0ED] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col gap-2 text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <h3 className="text-lg font-medium text-brand-dark">
              Want to be part of the team?
            </h3>
            <span className="bg-[#E5E2DC] text-xs font-semibold px-2 py-1 rounded border border-brand-dark/5">
              3 vacancies available
            </span>
          </div>
          <p className="text-sm text-brand-text/70">
            We're always looking for talented people who want to help businesses
            cut through AI overwhelm and build systems that work.
          </p>
        </div>

        <a
          href="mailto:careers@janeai.in"
          className="bg-brand-dark text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-black transition-transform hover:scale-105 active:scale-95 duration-300 whitespace-nowrap"
        >
          Apply now
        </a>
      </div>
    </motion.div>
  );
};

export default HiringBanner;
