import { calculateFocusScore, computeRollingFocusScore, scoreFromFrame, smoothDisplayScore } from "./focus-score";
import type {
  DistractionEvent,
  FrameMetrics,
  SessionSummary,
  SessionTick,
} from "@/types";
import { isDistractedStatus } from "@/lib/cv/focus-classifier";

export class SessionEngine {
  sessionId: string | null = null;
  startTime: number | null = null;
  endTime: number | null = null;
  ticks: SessionTick[] = [];
  distractionEvents: DistractionEvent[] = [];
  isActive = false;
  peakFocusScore = 0;
  sessionFocusScore = 0;

  private lastTickTime = 0;
  private lastStatus: string | null = null;
  private distractionStartTime: number | null = null;

  start(): string {
    this.sessionId = `session_${Date.now()}`;
    this.startTime = Date.now() / 1000;
    this.endTime = null;
    this.ticks = [];
    this.distractionEvents = [];
    this.isActive = true;
    this.peakFocusScore = 0;
    this.sessionFocusScore = 0;
    this.lastTickTime = this.startTime;
    this.lastStatus = null;
    this.distractionStartTime = null;
    return this.sessionId;
  }

  recordFrame(metrics: FrameMetrics): void {
    if (!this.isActive) return;

    const now = metrics.timestamp;
    const currentScore = metrics.current_focus_score;
    this.peakFocusScore = Math.max(this.peakFocusScore, currentScore);

    if (this.ticks.length === 0 || now - this.lastTickTime >= 1) {
      const tick: SessionTick = {
        timestamp: now,
        gaze: metrics.gaze_coord,
        head_angle: metrics.head_angle,
        posture: metrics.posture,
        status: metrics.status,
        focus_state: metrics.focusState,
        focus_score: currentScore,
      };
      this.ticks.push(tick);
      this.lastTickTime = now;

      const duration = now - (this.startTime ?? now);
      const { score } = calculateFocusScore(this.ticks, duration);
      this.sessionFocusScore = score;
    }

    if (isDistractedStatus(metrics.status)) {
      if (!this.distractionStartTime) {
        this.distractionStartTime = now;
      }
      if (this.lastStatus === "FOCUSED" || this.lastStatus === null) {
        this.distractionEvents.push({
          timestamp: now,
          trigger_type: metrics.status,
          details: { focus_state: metrics.focusState },
        });
      }
    } else {
      this.distractionStartTime = null;
    }

    this.lastStatus = metrics.status;
  }

  getSustainedDistractionSec(now: number): number {
    if (!this.distractionStartTime) return 0;
    return now - this.distractionStartTime;
  }

  getCurrentRollingScore(): number {
    return computeRollingFocusScore(this.ticks);
  }

  stop(): SessionSummary {
    if (!this.isActive || !this.sessionId || !this.startTime) {
      throw new Error("No active session");
    }

    this.endTime = Date.now() / 1000;
    this.isActive = false;

    const duration = this.endTime - this.startTime;
    const { score, stats } = calculateFocusScore(this.ticks, duration);
    const avgScore =
      this.ticks.length > 0
        ? this.ticks.reduce((sum, t) => sum + t.focus_score, 0) / this.ticks.length
        : 0;

    return {
      session_id: this.sessionId,
      user_id: "local",
      start_time: this.startTime,
      end_time: this.endTime,
      total_duration_seconds: duration,
      total_duration_minutes: stats.total_duration_minutes,
      total_ticks: stats.total_ticks,
      focused_ticks: stats.focused_ticks,
      total_percentage_focused: stats.total_percentage_focused,
      max_deep_focus_streak_minutes: stats.max_deep_focus_streak_minutes,
      saccade_count: stats.saccade_count,
      saccadic_density_score: stats.saccadic_density_score,
      focus_score: Math.round(score),
      peak_focus_score: Math.round(this.peakFocusScore),
      avg_focus_score: Math.round(avgScore),
      distraction_event_count: this.distractionEvents.length,
      distraction_events: this.distractionEvents,
      ticks: this.ticks,
    };
  }
}

export function enrichFrameWithScore(
  metrics: Omit<FrameMetrics, "current_focus_score">,
  sensitivity = 1,
): FrameMetrics {
  const raw = scoreFromFrame(
    {
      status: metrics.status,
      posture: metrics.posture.effective_s,
      gaze: metrics.gaze,
      headYaw: metrics.head_angle.yaw,
      headPitch: metrics.head_angle.pitch,
      confidence: metrics.confidence,
    },
    sensitivity,
  );
  const currentFocusScore = smoothDisplayScore(raw);
  return { ...metrics, current_focus_score: currentFocusScore };
}
