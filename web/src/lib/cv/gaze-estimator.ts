import {
  BLINK_EAR_THRESHOLD,
  EYE_OFFSET_SCALE,
  GAZE_EXTREME_BOTTOM,
  GAZE_EXTREME_LEFT,
  GAZE_EXTREME_RIGHT,
  GAZE_EXTREME_TOP,
  LEFT_EYE_CORNERS,
  LEFT_IRIS_CENTER,
  RIGHT_EYE_CORNERS,
  RIGHT_IRIS_CENTER,
} from "./constants";
import type { GazeMetrics } from "@/types";
import type { Landmark } from "./math-utils";

function eyeAspectRatio(landmarks: Landmark[], top: number, bottom: number, left: number, right: number): number {
  const vertical = Math.hypot(
    landmarks[top].x - landmarks[bottom].x,
    landmarks[top].y - landmarks[bottom].y,
  );
  const horizontal = Math.hypot(
    landmarks[left].x - landmarks[right].x,
    landmarks[left].y - landmarks[right].y,
  );
  return horizontal > 0 ? vertical / horizontal : 0;
}

function irisRatioInEye(
  landmarks: Landmark[],
  irisIdx: number,
  innerIdx: number,
  outerIdx: number,
): { horizontal: number; vertical: number } | null {
  if (!landmarks[irisIdx] || !landmarks[innerIdx] || !landmarks[outerIdx]) return null;

  const iris = landmarks[irisIdx];
  const inner = landmarks[innerIdx];
  const outer = landmarks[outerIdx];

  const eyeWidth = Math.abs(outer.x - inner.x);
  const eyeHeight = Math.abs(outer.y - inner.y) + 0.001;

  if (eyeWidth < 0.005) return null;

  const horizontal = 1 - (iris.x - Math.min(inner.x, outer.x)) / eyeWidth;
  const vertical = (iris.y - Math.min(inner.y, outer.y)) / eyeHeight;

  return {
    horizontal: Math.max(0, Math.min(1, horizontal)),
    vertical: Math.max(0, Math.min(1, vertical)),
  };
}

function interPupillaryDistance(landmarks: Landmark[]): number {
  const left = landmarks[LEFT_IRIS_CENTER];
  const right = landmarks[RIGHT_IRIS_CENTER];
  if (!left || !right) return 0.1;
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function estimateGaze(landmarks: Landmark[], headPitch = 0): GazeMetrics {
  const left = irisRatioInEye(
    landmarks,
    LEFT_IRIS_CENTER,
    LEFT_EYE_CORNERS.inner,
    LEFT_EYE_CORNERS.outer,
  );
  const right = irisRatioInEye(
    landmarks,
    RIGHT_IRIS_CENTER,
    RIGHT_EYE_CORNERS.inner,
    RIGHT_EYE_CORNERS.outer,
  );

  if (!left || !right) {
    return {
      horizontal_ratio: null,
      vertical_ratio: null,
      is_blinking: false,
      pupils_located: false,
    };
  }

  const pitchComp = headPitch * 0.008;
  const horizontalRatio = (left.horizontal + right.horizontal) / 2;
  const verticalRatio = Math.max(0, Math.min(1, (left.vertical + right.vertical) / 2 + pitchComp));

  const leftEar = eyeAspectRatio(landmarks, 159, 145, LEFT_EYE_CORNERS.outer, LEFT_EYE_CORNERS.inner);
  const rightEar = eyeAspectRatio(landmarks, 386, 374, RIGHT_EYE_CORNERS.outer, RIGHT_EYE_CORNERS.inner);
  const avgEar = (leftEar + rightEar) / 2;
  const isBlinking = avgEar < BLINK_EAR_THRESHOLD;

  return {
    horizontal_ratio: horizontalRatio,
    vertical_ratio: verticalRatio,
    is_blinking: isBlinking,
    pupils_located: true,
  };
}

export function isGazeExtreme(gaze: GazeMetrics): boolean {
  if (gaze.horizontal_ratio === null) return false;
  const hExtreme =
    gaze.horizontal_ratio <= GAZE_EXTREME_RIGHT || gaze.horizontal_ratio >= GAZE_EXTREME_LEFT;
  const vExtreme =
    gaze.vertical_ratio !== null &&
    (gaze.vertical_ratio <= GAZE_EXTREME_TOP || gaze.vertical_ratio >= GAZE_EXTREME_BOTTOM);
  return hExtreme || vExtreme;
}

export function computeEyeOffset(gaze: GazeMetrics, ipd = 0.1): [number, number, number] {
  if (gaze.horizontal_ratio === null || gaze.vertical_ratio === null) {
    return [0, 0, 0];
  }
  const scale = EYE_OFFSET_SCALE * Math.max(0.5, Math.min(2, ipd / 0.1));
  const gazeX = (0.5 - gaze.horizontal_ratio) * 2;
  const gazeY = (0.5 - gaze.vertical_ratio) * 2;
  return [gazeX * scale, gazeY * scale, 0];
}

export function getInterPupillaryDistance(landmarks: Landmark[]): number {
  return interPupillaryDistance(landmarks);
}
