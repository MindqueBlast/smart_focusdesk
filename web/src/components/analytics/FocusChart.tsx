"use client";

import { motion } from "framer-motion";
import type { SessionTick } from "@/types";

interface FocusChartProps {
  ticks: SessionTick[];
}

export function FocusChart({ ticks }: FocusChartProps) {
  if (ticks.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-line/60 bg-panel/30 text-sm text-dim">
        Not enough data for chart
      </div>
    );
  }

  const width = 600;
  const height = 160;
  const padding = 16;
  const scores = ticks.map((t) => t.focus_score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = Math.max(1, max - min);

  const points = ticks
    .map((t, i) => {
      const x = padding + (i / (ticks.length - 1)) * (width - padding * 2);
      const y = height - padding - ((t.focus_score - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-panel/30 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <defs>
          <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(22,243,162,0.35)" />
            <stop offset="100%" stopColor="rgba(22,243,162,0)" />
          </linearGradient>
        </defs>
        <motion.polyline
          fill="none"
          stroke="#16f3a2"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
}
