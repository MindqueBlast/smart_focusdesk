import { FOCUS_THRESHOLD, PITCH_THRESHOLD, YAW_THRESHOLD } from "./constants";
import type { PostureMetrics } from "@/types";

export function buildPostureMetrics(
  sFactor: number,
  normS: number,
  effectiveS: number,
): PostureMetrics {
  return {
    norm_s: normS,
    slump_val: sFactor,
    effective_s: effectiveS,
  };
}

export function isPoorPosture(effectiveS: number, threshold = FOCUS_THRESHOLD): boolean {
  return effectiveS >= threshold;
}

export function isPostureGood(
  effectiveYaw: number,
  effectivePitch: number,
): boolean {
  return (
    Math.abs(effectiveYaw) <= YAW_THRESHOLD &&
    effectivePitch <= PITCH_THRESHOLD
  );
}
