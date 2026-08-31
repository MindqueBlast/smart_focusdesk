import { describe, expect, it } from "vitest";
import { calculateFocusScore } from "@/lib/scoring/focus-score";
import type { SessionTick } from "@/types";

function makeTicks(count: number, focusedRatio: number): SessionTick[] {
  const ticks: SessionTick[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push({
      timestamp: i,
      gaze: [0.1 * i, 0.05 * i],
      head_angle: { pitch: 0, yaw: 0, roll: 0 },
      posture: { norm_s: 0.2, slump_val: 0.1, effective_s: 0.1 },
      status: i / count < focusedRatio ? "FOCUSED" : "GAZE AWAY",
      focus_state: "Focused",
      focus_score: 80,
    });
  }
  return ticks;
}

describe("calculateFocusScore", () => {
  it("returns 0 for empty ticks", () => {
    const { score } = calculateFocusScore([], 60);
    expect(score).toBe(0);
  });

  it("scores high for fully focused session", () => {
    const ticks = makeTicks(60, 1);
    const { score, stats } = calculateFocusScore(ticks, 60);
    expect(stats.total_percentage_focused).toBe(100);
    expect(score).toBeGreaterThan(70);
  });

  it("clamps score between 0 and 100", () => {
    const ticks = makeTicks(10, 0);
    const { score } = calculateFocusScore(ticks, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
