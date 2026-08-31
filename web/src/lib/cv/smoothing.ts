import {
  FAST_MOTION_THRESHOLD,
  HIGH_ALPHA,
  JITTER_MOTION_THRESHOLD,
  LOW_ALPHA,
  NOSE_TIP_IDX,
} from "./constants";
import type { Landmark } from "./math-utils";

export function applyLandmarkSmoothing(
  current: Landmark[],
  previous: Landmark[] | null,
): { smoothed: Landmark[]; previous: Landmark[] } {
  if (!previous || previous.length !== current.length) {
    return { smoothed: current.map((p) => ({ ...p })), previous: current.map((p) => ({ ...p })) };
  }

  const currNose = current[NOSE_TIP_IDX];
  const prevNose = previous[NOSE_TIP_IDX];
  const motion = Math.sqrt(
    (currNose.x - prevNose.x) ** 2 +
      (currNose.y - prevNose.y) ** 2 +
      (currNose.z - prevNose.z) ** 2,
  );

  let dynamicAlpha: number;
  if (motion <= JITTER_MOTION_THRESHOLD) {
    dynamicAlpha = LOW_ALPHA;
  } else if (motion >= FAST_MOTION_THRESHOLD) {
    dynamicAlpha = HIGH_ALPHA;
  } else {
    const blend =
      (motion - JITTER_MOTION_THRESHOLD) / (FAST_MOTION_THRESHOLD - JITTER_MOTION_THRESHOLD);
    dynamicAlpha = LOW_ALPHA + blend * (HIGH_ALPHA - LOW_ALPHA);
  }

  const smoothed = current.map((curr, i) => {
    const prev = previous[i];
    return {
      x: dynamicAlpha * curr.x + (1 - dynamicAlpha) * prev.x,
      y: dynamicAlpha * curr.y + (1 - dynamicAlpha) * prev.y,
      z: dynamicAlpha * curr.z + (1 - dynamicAlpha) * prev.z,
    };
  });

  return { smoothed, previous: smoothed.map((p) => ({ ...p })) };
}
