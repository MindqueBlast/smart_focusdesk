import type { SessionTick } from "@/types";
import { SACCADE_THRESHOLD } from "@/lib/cv/constants";

export interface FocusScoreStats {
  total_percentage_focused: number;
  max_deep_focus_streak_minutes: number;
  saccadic_density_score: number;
  saccade_count: number;
  total_duration_minutes: number;
  focused_ticks: number;
  total_ticks: number;
  avg_recovery_seconds: number;
}

export function calculateFocusScore(ticks: SessionTick[], durationSeconds: number): {
  score: number;
  stats: FocusScoreStats;
} {
  if (ticks.length === 0) {
    return {
      score: 0,
      stats: {
        total_percentage_focused: 0,
        max_deep_focus_streak_minutes: 0,
        saccadic_density_score: 0,
        saccade_count: 0,
        total_duration_minutes: 0,
        focused_ticks: 0,
        total_ticks: 0,
        avg_recovery_seconds: 0,
      },
    };
  }

  const totalDurationMinutes = Math.max(0.01, durationSeconds / 60);
  const totalTicks = ticks.length;
  const focusedTicks = ticks.filter((t) => t.status === "FOCUSED").length;
  const totalPercentageFocused = (focusedTicks / totalTicks) * 100;

  let maxStreakTicks = 0;
  let currentStreak = 0;
  for (const tick of ticks) {
    if (tick.status === "FOCUSED") {
      currentStreak += 1;
      maxStreakTicks = Math.max(maxStreakTicks, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  const maxDeepFocusStreakMinutes = maxStreakTicks / 60;

  let saccadeCount = 0;
  let prevGaze: [number, number] | null = null;
  for (const tick of ticks) {
    const gaze = tick.gaze;
    if (prevGaze && gaze) {
      const dist = Math.hypot(gaze[0] - prevGaze[0], gaze[1] - prevGaze[1]);
      if (dist > SACCADE_THRESHOLD) saccadeCount += 1;
    }
    if (gaze) prevGaze = gaze;
  }

  const recoveryTimes: number[] = [];
  let distractionStart: number | null = null;
  for (const tick of ticks) {
    if (tick.status !== "FOCUSED" && distractionStart === null) {
      distractionStart = tick.timestamp;
    } else if (tick.status === "FOCUSED" && distractionStart !== null) {
      recoveryTimes.push(tick.timestamp - distractionStart);
      distractionStart = null;
    }
  }
  const avgRecoverySeconds =
    recoveryTimes.length > 0
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
      : 0;

  const saccadicDensityScore = saccadeCount / totalDurationMinutes;
  const streakTerm = (maxDeepFocusStreakMinutes / totalDurationMinutes) * 30;
  const recoveryBonus = Math.max(0, 10 - avgRecoverySeconds * 0.5);
  const rawScore =
    totalPercentageFocused * 0.7 + streakTerm + recoveryBonus - saccadicDensityScore * 0.05;
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    stats: {
      total_percentage_focused: totalPercentageFocused,
      max_deep_focus_streak_minutes: maxDeepFocusStreakMinutes,
      saccadic_density_score: saccadicDensityScore,
      saccade_count: saccadeCount,
      total_duration_minutes: totalDurationMinutes,
      focused_ticks: focusedTicks,
      total_ticks: totalTicks,
      avg_recovery_seconds: avgRecoverySeconds,
    },
  };
}

export function computeRollingFocusScore(ticks: SessionTick[], windowSeconds = 30): number {
  if (ticks.length === 0) return 0;
  const now = ticks[ticks.length - 1].timestamp;
  const windowTicks = ticks.filter((t) => now - t.timestamp <= windowSeconds);
  if (windowTicks.length === 0) return ticks[ticks.length - 1].focus_score;

  const duration = Math.max(1, windowTicks[windowTicks.length - 1].timestamp - windowTicks[0].timestamp);
  const { score } = calculateFocusScore(windowTicks, duration);
  return score;
}

export interface FrameScoreInput {
  status: string;
  posture: number;
  gaze: { horizontal_ratio: number | null; vertical_ratio: number | null; pupils_located: boolean };
  headYaw: number;
  headPitch: number;
  confidence: number;
}

export function scoreFromFrame(input: FrameScoreInput, sensitivity = 1): number {
  const { status, posture, gaze, headYaw, headPitch, confidence } = input;

  const gazeScore =
    gaze.pupils_located && gaze.horizontal_ratio !== null
      ? 100 -
        Math.abs(gaze.horizontal_ratio - 0.5) * 120 -
        (gaze.vertical_ratio !== null ? Math.abs(gaze.vertical_ratio - 0.5) * 80 : 0)
      : 50;

  const headScore =
    100 - Math.abs(headYaw) * 1.5 - Math.max(0, headPitch - 10) * 1.2;

  const postureScore = Math.max(0, 100 - posture * 200);
  const stabilityScore = status === "FOCUSED" ? 100 : status === "NO FACE" ? 30 : 40;

  const w = confidence;
  const raw =
    (gazeScore * 0.35 + headScore * 0.25 + postureScore * 0.25 + stabilityScore * 0.15) * w +
    50 * (1 - w);

  return Math.max(0, Math.min(100, raw * sensitivity));
}

let displayScoreEma = 0;

export function smoothDisplayScore(raw: number): number {
  displayScoreEma = displayScoreEma * (1 - 0.15) + raw * 0.15;
  return Math.round(displayScoreEma);
}

export function resetDisplayScore() {
  displayScoreEma = 0;
}
