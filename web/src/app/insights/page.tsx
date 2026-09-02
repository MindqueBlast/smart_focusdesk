"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/layout/Nav";
import { SignInCard } from "@/components/auth/SignInCard";
import { InsightCard } from "@/components/analytics/InsightCard";
import { getAllSessions, loadProgress } from "@/lib/storage/db";
import { generateInsights, aggregateWeeklyStats, computeFocusHeatmap } from "@/lib/insights/insight-generator";
import type { Insight, SessionSummary, UserProgress } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function InsightsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    getAllSessions().then((s) => {
      setSessions(s);
      setInsights(generateInsights(s));
    });
    loadProgress().then(setProgress);
  }, []);

  const weekly = aggregateWeeklyStats(sessions);
  const heatmap = computeFocusHeatmap(sessions);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold">Focus Insights</h1>
        <p className="mt-2 text-muted">Patterns from your session history</p>

        {progress && progress.current_streak_days > 0 && (
          <div className="mt-8 flex items-center gap-6">
            <div className="text-center">
              <div className="font-display text-4xl font-semibold text-emerald">
                {progress.current_streak_days}
              </div>
              <div className="text-xs text-dim">day streak</div>
            </div>
            <div className="text-center">
              <div className="font-display text-4xl font-semibold">
                {Math.round(progress.total_focus_minutes)}
              </div>
              <div className="text-xs text-dim">total minutes</div>
            </div>
            <div className="text-center">
              <div className="font-display text-4xl font-semibold">
                {progress.longest_streak}
              </div>
              <div className="text-xs text-dim">best streak</div>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <WeeklyStat label="This week" value={`${weekly.sessionCount} sessions`} />
          <WeeklyStat label="Tracked" value={`${Math.round(weekly.totalMinutes)}m`} />
          <WeeklyStat label="Avg score" value={`${Math.round(weekly.avgScore)}`} />
          <WeeklyStat label="Best streak" value={`${Math.round(weekly.bestStreak)}m`} />
        </div>

        {sessions.length >= 3 && (
          <div className="mt-10">
            <h2 className="mb-4 font-display text-lg font-medium">Focus by time of day</h2>
            <div className="overflow-x-auto">
              <div className="inline-grid gap-1" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center text-[10px] text-dim">
                    {h % 6 === 0 ? h : ""}
                  </div>
                ))}
                {heatmap.map((row, di) => (
                  <div key={di} className="contents">
                    <div className="text-xs text-dim">{DAYS[di]}</div>
                    {row.map((score, hi) => (
                      <div
                        key={`${di}-${hi}`}
                        className="h-4 w-4 rounded-sm"
                        style={{
                          backgroundColor:
                            score > 0
                              ? `rgba(22, 243, 162, ${Math.min(0.9, score / 100)})`
                              : "rgba(27, 40, 53, 0.5)",
                        }}
                        title={score > 0 ? `${Math.round(score)} avg` : ""}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <SignInCard variant="compact" />
        </div>

        {insights.length === 0 ? (
          <p className="mt-16 text-center text-muted">
            Complete a few sessions to unlock personalized insights.
          </p>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {insights.map((insight, i) => (
              <InsightCard key={insight.id} insight={insight} index={i} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function WeeklyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/40 bg-panel/40 p-4">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}
