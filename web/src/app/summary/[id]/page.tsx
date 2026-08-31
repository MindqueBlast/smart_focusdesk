"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/layout/Nav";
import { ScoreRing } from "@/components/analytics/ScoreRing";
import { FocusChart } from "@/components/analytics/FocusChart";
import { Button } from "@/components/ui/Button";
import { getSession } from "@/lib/storage/db";
import { formatMinutes } from "@/lib/utils";
import type { SessionSummary } from "@/types";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    params.then((p) => {
      setSessionId(p.id);
      getSession(p.id).then((s) => setSession(s ?? null));
    });
  }, [params]);

  if (!session) {
    return (
      <>
        <Nav />
        <main className="flex min-h-[60vh] items-center justify-center text-muted">
          Loading session summary...
        </main>
      </>
    );
  }

  const distractedTicks = session.ticks.filter((t) => t.status !== "FOCUSED").length;
  const distractedPct = session.total_ticks
    ? ((distractedTicks / session.total_ticks) * 100).toFixed(0)
    : "0";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Session complete</p>
            <h1 className="font-display text-3xl font-semibold">Focus Summary</h1>
          </div>
          <ScoreRing score={session.focus_score} size={100} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="Duration" value={formatMinutes(session.total_duration_minutes)} />
          <SummaryStat label="Avg score" value={`${session.avg_focus_score}`} />
          <SummaryStat label="Peak score" value={`${session.peak_focus_score}`} />
          <SummaryStat label="Focused" value={`${session.total_percentage_focused.toFixed(0)}%`} />
          <SummaryStat label="Distractions" value={`${session.distraction_event_count}`} />
          <SummaryStat label="Distracted time" value={`${distractedPct}%`} />
          <SummaryStat
            label="Best streak"
            value={formatMinutes(session.max_deep_focus_streak_minutes)}
          />
          <SummaryStat label="Saccades" value={`${session.saccade_count}`} />
        </div>

        <div className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-medium">Focus timeline</h2>
          <FocusChart ticks={session.ticks} />
        </div>

        <div className="mt-10 glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-medium">Suggestions</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {session.total_percentage_focused < 60 && (
              <li>• Try shorter sessions with fewer browser tabs open.</li>
            )}
            {session.distraction_event_count > 5 && (
              <li>• Consider enabling Do Not Disturb during focus blocks.</li>
            )}
            {session.max_deep_focus_streak_minutes >= 15 && (
              <li>• Great deep focus streak — schedule demanding work in similar blocks.</li>
            )}
            {session.ticks.filter((t) => t.status === "SLOUCHING").length > session.total_ticks * 0.2 && (
              <li>• Posture drift was frequent — adjust monitor height or chair position.</li>
            )}
          </ul>
        </div>

        <div className="mt-10 flex gap-4">
          <Button href="/session">New Session</Button>
          <Button href="/history" variant="secondary">
            View History
          </Button>
        </div>
      </main>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
