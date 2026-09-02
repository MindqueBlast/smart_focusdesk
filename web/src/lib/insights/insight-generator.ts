import type { Insight, SessionSummary } from "@/types";
import { calculateFocusScore } from "@/lib/scoring/focus-score";

export function generateInsights(sessions: SessionSummary[]): Insight[] {
  if (sessions.length === 0) return [];

  const insights: Insight[] = [];
  const sorted = [...sessions].sort((a, b) => b.start_time - a.start_time);

  const avgScore =
    sorted.reduce((sum, s) => sum + s.focus_score, 0) / sorted.length;
  const avgDuration =
    sorted.reduce((sum, s) => sum + s.total_duration_minutes, 0) / sorted.length;

  const now = Date.now() / 1000;
  const weekAgo = now - 7 * 24 * 3600;
  const twoWeeksAgo = now - 14 * 24 * 3600;
  const thisWeek = sorted.filter((s) => s.start_time >= weekAgo);
  const lastWeek = sorted.filter((s) => s.start_time >= twoWeeksAgo && s.start_time < weekAgo);

  if (thisWeek.length > 0 && lastWeek.length > 0) {
    const thisAvg = thisWeek.reduce((s, x) => s + x.focus_score, 0) / thisWeek.length;
    const lastAvg = lastWeek.reduce((s, x) => s + x.focus_score, 0) / lastWeek.length;
    const diff = thisAvg - lastAvg;
    if (Math.abs(diff) >= 5) {
      insights.push({
        id: "week-trend",
        text:
          diff > 0
            ? `Your focus score improved ${Math.round(diff)} points vs last week. Keep it up!`
            : `Your focus score dropped ${Math.round(Math.abs(diff))} points vs last week. Try shorter, more frequent sessions.`,
        category: "focus",
        priority: 1,
      });
    }
  }

  const recoveryTimes: number[] = [];
  for (const s of sorted.slice(0, 5)) {
    const { stats } = calculateFocusScore(s.ticks, s.total_duration_seconds);
    if (stats.avg_recovery_seconds > 0) recoveryTimes.push(stats.avg_recovery_seconds);
  }
  if (recoveryTimes.length > 0) {
    const avgRecovery = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
    insights.push({
      id: "recovery",
      text:
        avgRecovery < 5
          ? `You recover focus quickly (avg ${avgRecovery.toFixed(1)}s after distractions).`
          : `It takes you ~${avgRecovery.toFixed(0)}s to refocus after distractions. Try a brief breathing pause.`,
      category: "distraction",
      priority: 2,
    });
  }

  if (avgScore >= 75) {
    insights.push({
      id: "strong-avg",
      text: `Your average focus score of ${Math.round(avgScore)} shows consistently strong attention.`,
      category: "focus",
      priority: 1,
    });
  } else if (avgScore < 50) {
    insights.push({
      id: "low-avg",
      text: `Your average focus score is ${Math.round(avgScore)}. Try shorter sessions with fewer distractions.`,
      category: "focus",
      priority: 1,
    });
  }

  const best = sorted.reduce((a, b) => (a.focus_score > b.focus_score ? a : b));
  const bestHour = new Date(best.start_time * 1000).getHours();
  insights.push({
    id: "best-time",
    text: `Your best session (${best.focus_score} score) started around ${formatHour(bestHour)}.`,
    category: "timing",
    priority: 3,
  });

  if (avgDuration >= 45) {
    insights.push({
      id: "session-length",
      text: `Your focus tends to drop after ~${Math.round(avgDuration * 0.7)} minutes. Consider shorter focus blocks.`,
      category: "timing",
      priority: 3,
    });
  }

  const slouchSessions = sorted.filter((s) => {
    const slouchTicks = s.ticks.filter((t) => t.status === "SLOUCHING").length;
    return slouchTicks / Math.max(1, s.total_ticks) > 0.2;
  });

  if (slouchSessions.length >= 2) {
    insights.push({
      id: "posture-trend",
      text: "Posture drift appears in multiple sessions. Consider adjusting your monitor height.",
      category: "posture",
      priority: 3,
    });
  }

  return insights.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}

export function aggregateWeeklyStats(sessions: SessionSummary[]) {
  const now = Date.now() / 1000;
  const weekAgo = now - 7 * 24 * 3600;
  const weekSessions = sessions.filter((s) => s.start_time >= weekAgo);

  return {
    sessionCount: weekSessions.length,
    totalMinutes: weekSessions.reduce((s, x) => s + x.total_duration_minutes, 0),
    avgScore:
      weekSessions.length > 0
        ? weekSessions.reduce((s, x) => s + x.focus_score, 0) / weekSessions.length
        : 0,
    totalDistractions: weekSessions.reduce((s, x) => s + x.distraction_event_count, 0),
    bestStreak: Math.max(0, ...weekSessions.map((s) => s.max_deep_focus_streak_minutes)),
  };
}

export function computeFocusHeatmap(sessions: SessionSummary[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const s of sessions) {
    const d = new Date(s.start_time * 1000);
    const day = d.getDay();
    const hour = d.getHours();
    grid[day][hour] += s.focus_score;
    counts[day][hour] += 1;
  }

  return grid.map((row, di) =>
    row.map((sum, hi) => (counts[di][hi] > 0 ? sum / counts[di][hi] : 0)),
  );
}
