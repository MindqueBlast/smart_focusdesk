"use client";

import type { FrameMetrics } from "@/types";

interface GazeOverlayProps {
  metrics: FrameMetrics | null;
}

export function GazeOverlay({ metrics }: GazeOverlayProps) {
  if (!metrics?.face_detected || !metrics.gaze_coord) return null;

  const [gx, gy] = metrics.gaze_coord;
  const x = 50 + gx * 25;
  const y = 50 - gy * 25;
  const yaw = metrics.head_angle.yaw;
  const pitch = metrics.head_angle.pitch;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100">
      <circle
        cx={Math.max(5, Math.min(95, x))}
        cy={Math.max(5, Math.min(95, y))}
        r="2"
        fill="rgba(22, 243, 162, 0.8)"
        className="transition-all duration-150"
      />
      <line
        x1="50"
        y1="50"
        x2={50 + yaw * 0.3}
        y2={50 + pitch * 0.3}
        stroke="rgba(105, 215, 255, 0.5)"
        strokeWidth="0.5"
      />
    </svg>
  );
}
