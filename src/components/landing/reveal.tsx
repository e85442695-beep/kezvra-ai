"use client";
import { motion } from "motion/react";

/** Fade/slide-in on scroll. Disabled automatically under prefers-reduced-motion (MotionConfig). */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
