"use client";

import { motion } from "framer-motion";
import type { Insight } from "@/types";

interface InsightCardProps {
  insight: Insight;
  index: number;
}

export function InsightCard({ insight, index }: InsightCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="glass rounded-2xl p-5"
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-emerald/80">
        {insight.category}
      </span>
      <p className="mt-2 text-sm leading-relaxed text-text/90">{insight.text}</p>
    </motion.div>
  );
}
