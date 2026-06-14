import { Variants } from "framer-motion";

export const blurInVariants: Variants = {
  hidden: { 
    opacity: 0, 
    filter: "blur(10px)", 
    y: 20 
  },
  visible: { 
    opacity: 1, 
    filter: "blur(0px)", 
    y: 0,
    transition: { 
      duration: 0.8, 
      ease: [0.16, 1, 0.3, 1] 
    }
  }
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};
