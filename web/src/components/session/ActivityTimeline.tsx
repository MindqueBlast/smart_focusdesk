"use client";

import type { SessionTick } from "@/types";
import { FOCUS_STATE_COLORS } from "@/lib/cv/focus-states";

interface ActivityTimelineProps {
  ticks: SessionTick[];
  durationSec: number;
}

export function ActivityTimeline({ ticks, durationSec }: ActivityTimelineProps) {
  if (ticks.length === 0) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl border border-line/60 bg-panel/40 text-xs text-dim">
        Timeline will appear as your session progresses
      </div>
    );
  }

  const start = ticks[0].timestamp;
  const end = Math.max(durationSec + start, ticks[ticks.length - 1].timestamp);
  const span = Math.max(1, end - start);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Activity timeline</span>
        <span>{ticks.length} samples</span>
      </div>
      <div className="relative h-10 overflow-hidden rounded-xl border border-line/60 bg-panel/40">
        {ticks.map((tick, i) => {
          const left = ((tick.timestamp - start) / span) * 100;
          const color =
            tick.focus_state === "Focused"
              ? FOCUS_STATE_COLORS.Focused
              : tick.focus_state === "Poor Posture"
                ? FOCUS_STATE_COLORS["Poor Posture"]
                : FOCUS_STATE_COLORS["Looking Away"];
          return (
            <div
              key={`${tick.timestamp}-${i}`}
              className="absolute top-1 bottom-1 w-1 rounded-full opacity-80"
              style={{ left: `${left}%`, background: color }}
            />
          );
        })}
      </div>
    </div>
  );
}
