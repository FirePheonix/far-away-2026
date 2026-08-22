'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const nodes = [
  { top: '15%', left: '10%', size: 4, delay: 0 },
  { top: '25%', left: '35%', size: 6, delay: 1 },
  { top: '10%', left: '60%', size: 3, delay: 2 },
  { top: '40%', left: '20%', size: 5, delay: 0.5 },
  { top: '55%', left: '45%', size: 4, delay: 1.5 },
  { top: '80%', left: '15%', size: 6, delay: 2.5 },
  { top: '75%', left: '35%', size: 3, delay: 0.8 },
  { top: '30%', left: '80%', size: 5, delay: 1.2 },
  { top: '15%', left: '90%', size: 4, delay: 0.3 },
  { top: '65%', left: '75%', size: 6, delay: 2.1 },
  { top: '85%', left: '60%', size: 4, delay: 1.7 },
  { top: '90%', left: '85%', size: 5, delay: 0.9 },
  { top: '50%', left: '10%', size: 3, delay: 1.1 },
  { top: '20%', left: '50%', size: 4, delay: 0.4 },
  { top: '70%', left: '50%', size: 5, delay: 1.8 },
];

const trails = [
  {
    d: "M 10 15 Q 40 20 80 50",
    duration: 8,
    delay: 0,
  },
  {
    d: "M 15 80 Q 50 80 80 50",
    duration: 10,
    delay: 2,
  },
  {
    d: "M 45 55 Q 60 70 80 50",
    duration: 6,
    delay: 4,
  }
];

const ScatteredNodesBackground = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-black/95 rounded-[2.5rem]">
      {/* Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Focal Glow */}
      <div 
        className="absolute rounded-full pointer-events-none blur-[80px] opacity-30 mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)',
          width: '600px',
          height: '600px',
          top: '50%',
          left: '80%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      
      {/* SVG Trails */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none" 
        viewBox="0 0 100 100" 
        preserveAspectRatio="none"
      >
        {trails.map((trail, i) => (
          <motion.path
            key={i}
            d={trail.d}
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="0.2"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={
              shouldReduceMotion 
                ? { pathLength: 1, opacity: 0.5 }
                : { 
                    pathLength: [0, 1, 1], 
                    opacity: [0, 1, 0] 
                  }
            }
            transition={{
              duration: trail.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: trail.delay,
              times: [0, 0.8, 1]
            }}
          />
        ))}
      </svg>

      {/* Scattered Nodes */}
      {nodes.map((node, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/20 backdrop-blur-sm"
          style={{
            top: node.top,
            left: node.left,
            width: node.size,
            height: node.size,
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.1)'
          }}
          animate={
            shouldReduceMotion
              ? {}
              : {
                  y: [0, -15, 0],
                  x: [0, 10, 0],
                  opacity: [0.3, 0.7, 0.3],
                }
          }
          transition={{
            duration: 10 + (i % 5),
            repeat: Infinity,
            ease: "easeInOut",
            delay: node.delay,
          }}
        />
      ))}
      
      {/* Core Node */}
      <div 
        className="absolute bg-white/60 rounded-full blur-[2px]"
        style={{
          top: '50%',
          left: '80%',
          width: 8,
          height: 8,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 20px 4px rgba(255, 255, 255, 0.4)'
        }}
      />
    </div>
  );
};

export default ScatteredNodesBackground;
