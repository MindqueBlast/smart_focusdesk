import type { GazeMetrics } from "@/types";
import type { Landmark } from "./math-utils";
import { NOSE_TIP_IDX } from "./constants";

export interface TrackingQuality {
  confidence: number;
  lowLight: boolean;
  faceCentered: boolean;
  faceDistance: "too_close" | "too_far" | "good";
}

let prevNose: { x: number; y: number } | null = null;

export function computeTrackingQuality(
  landmarks: Landmark[],
  gaze: GazeMetrics,
): TrackingQuality {
  const nose = landmarks[NOSE_TIP_IDX];
  const faceCentered =
    nose.x > 0.25 && nose.x < 0.75 && nose.y > 0.2 && nose.y < 0.8;

  let faceDistance: TrackingQuality["faceDistance"] = "good";
  const faceHeight = Math.abs(landmarks[10]?.y - landmarks[152]?.y) ?? 0;
  if (faceHeight > 0.45) faceDistance = "too_close";
  else if (faceHeight < 0.12) faceDistance = "too_far";

  let stability = 1;
  if (prevNose) {
    const motion = Math.hypot(nose.x - prevNose.x, nose.y - prevNose.y);
    stability = Math.max(0, 1 - motion * 20);
  }
  prevNose = { x: nose.x, y: nose.y };

  const gazeOk = gaze.pupils_located ? 1 : 0.3;
  const centerOk = faceCentered ? 1 : 0.5;
  const distOk = faceDistance === "good" ? 1 : 0.6;

  const confidence = Math.max(0.1, Math.min(1, gazeOk * 0.4 + centerOk * 0.3 + distOk * 0.15 + stability * 0.15));
  const lowLight = !gaze.pupils_located || faceHeight < 0.08;

  return { confidence, lowLight, faceCentered, faceDistance };
}

export function resetTrackingQuality() {
  prevNose = null;
}
