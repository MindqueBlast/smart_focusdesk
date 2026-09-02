"use client";

import { motion } from "framer-motion";
import type { FrameMetrics } from "@/types";

const CORNER_LABELS = [
  "Look at the top-left corner of your screen",
  "Look at the top-right corner of your screen",
  "Look at the bottom-right corner of your screen",
  "Look at the bottom-left corner of your screen",
];

const CORNER_POSITIONS = [
  "top-4 left-4",
  "top-4 right-4",
  "bottom-4 right-4",
  "bottom-4 left-4",
];

interface CalibrationFlowProps {
  metrics: FrameMetrics | null;
  trackingMode: "CALIBRATED_THRESHOLDS" | "DYNAMIC_MAPPING";
  onStartCalibration: () => void;
  onComplete: () => void;
  className?: string;
}

export function CalibrationFlow({
  metrics,
  trackingMode,
  onStartCalibration,
  onComplete,
  className,
}: CalibrationFlowProps) {
  const cal = metrics?.calibration;
  const quality = metrics?.tracking_quality;
  const stage = cal?.stage ?? "intro";
  const isDynamic = trackingMode === "DYNAMIC_MAPPING";

  if (stage === "complete" && cal?.complete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`space-y-6 text-center ${className ?? ""}`}
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald/20">
          <svg className="h-10 w-10 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">You&apos;re calibrated</h2>
          <p className="mt-2 text-muted">
            SmartFocus learned your neutral pose{isDynamic ? " and screen gaze mapping" : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="w-full rounded-xl bg-emerald px-6 py-4 text-lg font-medium text-page hover:bg-emerald/90"
        >
          Start Session →
        </button>
      </motion.div>
    );
  }

  if (stage === "intro" || !cal || cal.state === "idle" && !cal.complete) {
    if (cal?.state !== "countdown" && cal?.state !== "sampling" && cal?.state !== "corner_countdown" && cal?.state !== "corner_sampling") {
      return (
        <div className={`space-y-6 ${className ?? ""}`}>
          <div>
            <h2 className="font-display text-2xl font-semibold">Calibrate your setup</h2>
            <p className="mt-2 text-muted">
              {isDynamic
                ? "We'll map your gaze to screen corners for precise tracking."
                : "We'll capture your neutral sitting pose so tracking adapts to you."}
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li>• Center your face in the guide</li>
            <li>• Ensure good lighting on your face</li>
            <li>• Sit in your normal working position</li>
          </ul>
          <button
            type="button"
            onClick={onStartCalibration}
            className="w-full rounded-xl bg-emerald px-6 py-3 font-medium text-page hover:bg-emerald/90"
          >
            Begin Calibration
          </button>
        </div>
      );
    }
  }

  const countdown = cal?.countdown_remaining;
  const isCountdown = stage === "countdown";
  const isSampling = stage === "sampling";
  const cornerIdx = cal?.corner_index ?? 0;

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          {isDynamic
            ? `Corner ${cornerIdx + 1} of ${CORNER_LABELS.length}`
            : "Neutral pose calibration"}
        </span>
        <span className="text-emerald">{Math.round(cal?.progress_pct ?? 0)}%</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full bg-emerald"
          animate={{ width: `${cal?.progress_pct ?? 0}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {isDynamic && isCountdown && (
        <p className="text-center text-lg font-medium">{CORNER_LABELS[cornerIdx]}</p>
      )}

      {!isDynamic && isCountdown && (
        <p className="text-center text-lg font-medium">Hold still — look at your screen</p>
      )}

      {isSampling && (
        <p className="flex items-center justify-center gap-2 text-center text-emerald">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald" />
          Recording calibration data...
        </p>
      )}

      {isCountdown && countdown !== undefined && (
        <div className="flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-line" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={283}
                strokeDashoffset={283 * (1 - (3 - countdown) / 3)}
                className="text-emerald transition-all duration-1000"
              />
            </svg>
            <span className="font-display text-3xl font-semibold">{Math.ceil(countdown)}</span>
          </div>
        </div>
      )}

      {quality && (
        <div className="flex flex-wrap justify-center gap-2 text-xs">
          {!quality.faceCentered && (
            <span className="rounded-full bg-amber/20 px-3 py-1 text-amber">Center your face</span>
          )}
          {quality.faceDistance === "too_close" && (
            <span className="rounded-full bg-amber/20 px-3 py-1 text-amber">Move back slightly</span>
          )}
          {quality.faceDistance === "too_far" && (
            <span className="rounded-full bg-amber/20 px-3 py-1 text-amber">Move closer</span>
          )}
          {quality.lowLight && (
            <span className="rounded-full bg-amber/20 px-3 py-1 text-amber">Improve lighting</span>
          )}
          {cal?.position_ok && (
            <span className="rounded-full bg-emerald/20 px-3 py-1 text-emerald">Position good</span>
          )}
        </div>
      )}

      {isDynamic && isCountdown && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute h-8 w-8 rounded-full border-2 border-emerald animate-pulse ${CORNER_POSITIONS[cornerIdx]}`}
          />
        </div>
      )}
    </div>
  );
}
