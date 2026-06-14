import { motion } from "framer-motion";

const IntroLogos = () => {
  const brands = [
    { name: "Amsterdam", className: "font-sans font-bold" },
    { name: "Hamilton", className: "font-serif italic" },
    { name: "CALIFORNIA", className: "font-sans font-black tracking-[0.2em]" },
    { name: "venice.", className: "font-serif font-bold" },
    { name: "ZURICH", className: "font-sans font-light tracking-[0.2em]" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.6 }}
      className="w-full py-16 flex flex-col items-center gap-8"
    >
      <p className="text-xs font-medium text-brand-text/60 uppercase tracking-wide">
        Brands we've helped implement AI:
      </p>

      <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 w-full opacity-40 grayscale hover:opacity-60 transition-opacity duration-500">
        {brands.map((brand, idx) => (
          <span
            key={idx}
            className={`text-2xl md:text-3xl text-brand-dark ${brand.className}`}
          >
            {brand.name}
          </span>
        ))}
        {/* Faded partial logo for effect */}
        <span className="text-2xl md:text-3xl text-brand-dark font-serif italic opacity-20 blur-[1px]">
          Paris
        </span>
      </div>
    </motion.div>
  );
};

export default IntroLogos;
