"use client";

import { motion } from "framer-motion";
import type { FocusState } from "@/types";
import { FOCUS_STATE_GLOW } from "@/lib/cv/focus-states";

interface AmbientBackgroundProps {
  focusState: FocusState;
  reducedMotion?: boolean;
}

export function AmbientBackground({ focusState, reducedMotion }: AmbientBackgroundProps) {
  const glow = FOCUS_STATE_GLOW[focusState];

  if (reducedMotion) {
    return (
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${glow}, transparent 60%)` }}
      />
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        key={focusState}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${glow}, transparent 55%)`,
        }}
      />
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-32 top-1/4 h-96 w-96 rounded-full blur-[120px] opacity-30"
        style={{ background: glow }}
      />
      <motion.div
        animate={{ x: [0, -25, 0], y: [0, 15, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-24 bottom-1/4 h-80 w-80 rounded-full blur-[100px] opacity-20"
        style={{ background: "rgba(105, 215, 255, 0.15)" }}
      />
    </div>
  );
}
