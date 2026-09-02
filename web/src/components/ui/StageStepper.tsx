"use client";

import { cn } from "@/lib/utils";

interface StageStepperProps {
  current: number;
  total: number;
  labels?: string[];
  className?: string;
}

export function StageStepper({ current, total, labels, className }: StageStepperProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < current ? "bg-emerald" : i === current ? "bg-emerald/50" : "bg-line",
            )}
          />
        ))}
      </div>
      {labels && labels[current] && (
        <p className="text-sm text-muted">{labels[current]}</p>
      )}
    </div>
  );
}
