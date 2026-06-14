import { motion } from "framer-motion";
import assets from "../data/assets.json";

const IntroVisual = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full relative aspect-[16/9] md:aspect-[2.2/1] rounded-[2.5rem] overflow-hidden"
    >
      {/* GIF Background - UPDATED */}
      <div className="absolute inset-0">
        <img
          src={assets.vercel.visuals.intro_gif}
          alt="Abstract Motion"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Dot Grid Overlay */}
      <div
        className="absolute inset-0 z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,1) 25%, transparent 26%)",
          backgroundSize: "36px 36px", // Spacing of dots
          backgroundPosition: "center",
        }}
      />
    </motion.div>
  );
};

export default IntroVisual;
