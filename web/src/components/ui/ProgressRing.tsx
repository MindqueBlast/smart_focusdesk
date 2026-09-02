"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
}

export function ProgressRing({
  value,
  max = 100,
  size = 80,
  stroke = 6,
  className,
  label,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value / max));
  const offset = circ * (1 - pct);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-emerald transition-all duration-500"
        />
      </svg>
      {label !== undefined && (
        <span className="absolute text-sm font-medium">{label}</span>
      )}
    </div>
  );
}
