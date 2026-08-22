/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PreloaderProps {
  onComplete: () => void;
}

const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Total duration = Animation time + hold + exit
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 1000); // Wait for exit animation
    }, 1300);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={{
            initial: { opacity: 1 },
            animate: { opacity: 1 },
            exit: {
              opacity: 0,
              transition: { duration: 0.8, ease: "easeInOut" },
            },
          }}
          className="fixed inset-0 z-[9999] bg-brand-bg flex items-center justify-center"
        >
          <motion.div
            variants={{
              initial: { scale: 1 },
              animate: { scale: 1 },
              exit: {
                scale: 2,
                opacity: 0,
                filter: "blur(10px)",
                transition: { duration: 0.8, ease: "easeInOut" },
              },
            }}
            className="relative flex items-center justify-center"
          >
            {/* Soft glow behind the logo, fades in alongside it */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 0.35, scale: 1.1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute w-40 h-40 md:w-56 md:h-56 rounded-full blur-3xl"
              style={{ backgroundColor: "#F0997B" }}
            />

            {/* Logo — rises from below, fades in, unblurs */}
            <motion.img
              // TODO: point this at your actual logo asset,
              // e.g. "/logo-3d.png" or an imported asset from your images folder
              src="/footer-logo-image.png"
              alt="Clawvio"
              initial={{ y: 70, opacity: 0, scale: 0.92, filter: "blur(10px)" }}
              animate={{ y: 0, opacity: 1, scale: 1.5, filter: "blur(0px)" }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-28 md:w-40 h-auto select-none pointer-events-none"
              draggable={false}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Preloader;
