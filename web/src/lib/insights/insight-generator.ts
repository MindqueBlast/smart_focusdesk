import type { Insight, SessionSummary } from "@/types";

export function generateInsights(sessions: SessionSummary[]): Insight[] {
  if (sessions.length === 0) return [];

  const insights: Insight[] = [];
  const sorted = [...sessions].sort((a, b) => b.start_time - a.start_time);

  const avgScore =
    sorted.reduce((sum, s) => sum + s.focus_score, 0) / sorted.length;
  const avgDuration =
    sorted.reduce((sum, s) => sum + s.total_duration_minutes, 0) / sorted.length;

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

  const longSessions = sorted.filter((s) => s.total_duration_minutes >= 30);
  const shortSessions = sorted.filter((s) => s.total_duration_minutes < 30);

  if (longSessions.length > 0 && shortSessions.length > 0) {
    const longAvg =
      longSessions.reduce((s, x) => s + x.distraction_event_count, 0) / longSessions.length;
    const shortAvg =
      shortSessions.reduce((s, x) => s + x.distraction_event_count, 0) / shortSessions.length;

    if (longAvg < shortAvg) {
      insights.push({
        id: "longer-fewer-distractions",
        text: "You had significantly fewer distractions during longer uninterrupted sessions.",
        category: "distraction",
        priority: 2,
      });
    }
  }

  const best = sorted.reduce((a, b) => (a.focus_score > b.focus_score ? a : b));
  const bestHour = new Date(best.start_time * 1000).getHours();
  insights.push({
    id: "best-time",
    text: `Your best session (${best.focus_score} score) started around ${formatHour(bestHour)}.`,
    category: "timing",
    priority: 3,
  });

  const latest = sorted[0];
  if (latest.max_deep_focus_streak_minutes >= 10) {
    insights.push({
      id: "deep-streak",
      text: `Your longest uninterrupted focus streak was ${Math.round(latest.max_deep_focus_streak_minutes)} minutes in your latest session.`,
      category: "focus",
      priority: 2,
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

  if (avgDuration >= 40) {
    insights.push({
      id: "first-half",
      text: `Your focus was strongest during your first ${Math.round(avgDuration * 0.6)} minutes on average.`,
      category: "timing",
      priority: 4,
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
