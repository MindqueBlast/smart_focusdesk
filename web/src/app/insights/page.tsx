"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/layout/Nav";
import { InsightCard } from "@/components/analytics/InsightCard";
import { getAllSessions } from "@/lib/storage/db";
import { generateInsights, aggregateWeeklyStats } from "@/lib/insights/insight-generator";
import type { Insight, SessionSummary } from "@/types";

export default function InsightsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    getAllSessions().then((s) => {
      setSessions(s);
      setInsights(generateInsights(s));
    });
  }, []);

  const weekly = aggregateWeeklyStats(sessions);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold">Focus Insights</h1>
        <p className="mt-2 text-muted">Patterns from your session history</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <WeeklyStat label="This week" value={`${weekly.sessionCount} sessions`} />
          <WeeklyStat label="Tracked" value={`${Math.round(weekly.totalMinutes)}m`} />
          <WeeklyStat label="Avg score" value={`${Math.round(weekly.avgScore)}`} />
          <WeeklyStat label="Best streak" value={`${Math.round(weekly.bestStreak)}m`} />
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
    <div className="glass rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold">{value}</div>
    </div>
  );
}
