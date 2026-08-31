"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface CameraPanelProps {
  className?: string;
  overlay?: React.ReactNode;
  dimmed?: boolean;
}

export const CameraPanel = forwardRef<HTMLVideoElement, CameraPanelProps>(
  function CameraPanel({ className, overlay, dimmed }, ref) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-line/80 bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
          dimmed && "opacity-80",
          className,
        )}
      >
        <video
          ref={ref}
          className="h-full w-full scale-x-[-1] object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-page/60 via-transparent to-transparent" />
        {overlay && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {overlay}
          </div>
        )}
      </div>
    );
  },
);
