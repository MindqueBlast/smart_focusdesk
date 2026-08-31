"use client";

import { cn } from "@/lib/utils";

interface CameraPanelProps {
  className?: string;
  overlay?: React.ReactNode;
  dimmed?: boolean;
  videoRef?: (node: HTMLVideoElement | null) => void;
  status?: "idle" | "requesting" | "active" | "playing" | "error";
}

export function CameraPanel({
  className,
  overlay,
  dimmed,
  videoRef,
  status = "idle",
}: CameraPanelProps) {
  const showLoading = status === "requesting" || status === "active";
  const showLive = status === "playing";

  return (
    <div
      className={cn(
        "relative min-h-[200px] overflow-hidden rounded-2xl border border-line/80 bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
        dimmed && "opacity-80",
        className,
      )}
    >
      <video
        ref={videoRef}
        className="h-full min-h-[200px] w-full scale-x-[-1] object-cover"
        playsInline
        muted
        autoPlay
      />

      {showLoading && !showLive && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald border-t-transparent" />
          <span className="text-sm text-muted">
            {status === "requesting" ? "Requesting camera access..." : "Starting camera..."}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-page/60 via-transparent to-transparent" />

      {showLive && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-page/70 px-2.5 py-1 text-xs text-emerald backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
          Live
        </div>
      )}

      {overlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {overlay}
        </div>
      )}
    </div>
  );
}
