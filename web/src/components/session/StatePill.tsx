"use client";

import { motion } from "framer-motion";
import { FOCUS_STATE_COLORS, FOCUS_STATE_GLOW } from "@/lib/cv/focus-states";
import type { FocusState } from "@/types";

interface StatePillProps {
  state: FocusState;
}

export function StatePill({ state }: StatePillProps) {
  const color = FOCUS_STATE_COLORS[state];
  const glow = FOCUS_STATE_GLOW[state];

  return (
    <motion.div
      key={state}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
      style={{
        color,
        background: glow,
        boxShadow: `0 0 24px ${glow}`,
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {state}
    </motion.div>
  );
}
