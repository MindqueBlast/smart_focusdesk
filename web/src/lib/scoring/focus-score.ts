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

  const saccadicDensityScore = saccadeCount / totalDurationMinutes;
  const streakTerm = (maxDeepFocusStreakMinutes / totalDurationMinutes) * 30;
  const rawScore =
    totalPercentageFocused * 0.7 + streakTerm - saccadicDensityScore * 0.05;
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

export function scoreFromFrame(status: string, posture: number, sensitivity = 1): number {
  let base = 85;
  if (status !== "FOCUSED") base -= 35;
  if (posture >= 0.35) base -= 20;
  if (status === "EYES CLOSED") base -= 15;
  if (status === "SLOUCHING") base -= 10;
  return Math.max(0, Math.min(100, base * sensitivity));
}
