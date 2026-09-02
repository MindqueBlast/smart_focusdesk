import type { FocusState, InternalStatus } from "@/types";
import { isDistractedStatus } from "./focus-classifier";

const DISTRACTED_STATUSES: InternalStatus[] = [
  "LOOKING AWAY",
  "LOOKING LEFT",
  "LOOKING RIGHT",
  "GAZE AWAY",
  "EYES CLOSED",
  "LOOKING DOWN",
  "FACE LOST",
];

export interface FocusStateContext {
  status: InternalStatus;
  effectiveS: number;
  sustainedDistractionSec: number;
  sessionDurationMin: number;
  currentScore: number;
  poorPosture: boolean;
  breakReminderMinutes?: number;
}

export function mapToFocusState(ctx: FocusStateContext): FocusState {
  const breakMin = ctx.breakReminderMinutes ?? 90;

  if (ctx.sessionDurationMin >= breakMin && ctx.currentScore < 45) {
    return "Take a Break";
  }

  if (ctx.sustainedDistractionSec >= 5) {
    return "Highly Distracted";
  }

  if (ctx.poorPosture || ctx.status === "SLOUCHING") {
    return "Poor Posture";
  }

  if (DISTRACTED_STATUSES.includes(ctx.status)) {
    if (ctx.sustainedDistractionSec >= 1.5) {
      return "Looking Away";
    }
    return "Slightly Distracted";
  }

  if (ctx.status === "FOCUSED") {
    return "Focused";
  }

  if (ctx.status === "NO FACE") {
    return "Slightly Distracted";
  }

  return isDistractedStatus(ctx.status) ? "Looking Away" : "Focused";
}

export const FOCUS_STATE_COLORS: Record<FocusState, string> = {
  Focused: "#16f3a2",
  "Slightly Distracted": "#69d7ff",
  "Looking Away": "#ffc55a",
  "Poor Posture": "#ff8c42",
  "Highly Distracted": "#ff465d",
  "Take a Break": "#c084fc",
};

export const FOCUS_STATE_GLOW: Record<FocusState, string> = {
  Focused: "rgba(22, 243, 162, 0.25)",
  "Slightly Distracted": "rgba(105, 215, 255, 0.2)",
  "Looking Away": "rgba(255, 197, 90, 0.2)",
  "Poor Posture": "rgba(255, 140, 66, 0.2)",
  "Highly Distracted": "rgba(255, 70, 93, 0.25)",
  "Take a Break": "rgba(192, 132, 252, 0.2)",
};
