import { motion } from "framer-motion";

const FooterLogos = () => {
  const brands = [
    { name: "Amsterdam", font: "font-sans font-bold" },
    { name: "Hamilton", font: "font-serif italic" },
    { name: "CALIFORNIA", font: "font-sans font-black tracking-widest" },
    { name: "venice.", font: "font-serif font-bold" },
    { name: "ZURICH", font: "font-sans font-light tracking-widest" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.8, duration: 1 }}
      className="w-full mt-24 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12 border-t border-brand-dark/5 pt-12"
    >
      <p className="text-sm text-brand-text/60 font-medium whitespace-nowrap">
        Brands we've helped <br className="hidden md:block" /> implement AI:
      </p>

      <div className="flex flex-wrap justify-center md:justify-end items-center gap-8 md:gap-12 w-full grayscale opacity-50 hover:opacity-80 transition-opacity duration-500">
        {brands.map((brand, idx) => (
          <span
            key={idx}
            className={`text-xl md:text-2xl text-brand-dark ${brand.font}`}
          >
            {brand.name}
          </span>
        ))}
      </div>
    </motion.div>
  );
};

export default FooterLogos;
