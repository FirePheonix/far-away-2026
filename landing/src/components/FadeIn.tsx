import React from "react";
import { motion } from "framer-motion";
import { blurInVariants } from "../utils/animations";

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

const FadeIn: React.FC<FadeInProps> = ({
  children,
  className = "",
  delay = 0,
}) => {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={{
        ...blurInVariants,
        visible: {
          ...blurInVariants.visible,
          transition: {
            ...((blurInVariants.visible as any).transition as any),
            delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default FadeIn;
