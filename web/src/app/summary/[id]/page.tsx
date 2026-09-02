"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/layout/Nav";
import { SignInCard } from "@/components/auth/SignInCard";
import { ScoreRing } from "@/components/analytics/ScoreRing";
import { FocusChart } from "@/components/analytics/FocusChart";
import { Button } from "@/components/ui/Button";
import { getSession, deleteSession } from "@/lib/storage/db";
import { calculateFocusScore } from "@/lib/scoring/focus-score";
import { formatMinutes } from "@/lib/utils";
import type { SessionSummary } from "@/types";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    params.then((p) => {
      getSession(p.id).then((s) => {
        setSession(s ?? null);
        setLoaded(true);
      });
    });
  }, [params]);

  if (!loaded) {
    return (
      <>
        <Nav />
        <main className="flex min-h-[60vh] items-center justify-center text-muted">
          Loading session summary...
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Nav />
        <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Session not found</h1>
          <p className="mt-4 text-muted">This session may have been deleted or never saved.</p>
          <Button className="mt-8" href="/history">
            Back to History
          </Button>
        </main>
      </>
    );
  }

  const distractedTicks = session.ticks.filter((t) => t.status !== "FOCUSED").length;
  const distractedPct = session.total_ticks
    ? ((distractedTicks / session.total_ticks) * 100).toFixed(0)
    : "0";

  const { stats } = calculateFocusScore(session.ticks, session.total_duration_seconds);

  const handleDelete = async () => {
    if (!confirm("Delete this session permanently?")) return;
    await deleteSession(session.session_id);
    router.push("/history");
  };

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
          <SummaryStat
            label="Recovery time"
            value={stats.avg_recovery_seconds > 0 ? `${stats.avg_recovery_seconds.toFixed(1)}s` : "—"}
          />
        </div>

        <div className="mt-10 space-y-4">
          <h2 className="font-display text-xl font-medium">Focus timeline</h2>
          <FocusChart ticks={session.ticks} />
        </div>

        {session.distraction_events.length > 0 && (
          <div className="mt-10 space-y-4">
            <h2 className="font-display text-xl font-medium">Distraction events</h2>
            <div className="space-y-2">
              {session.distraction_events.slice(0, 8).map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-line/40 bg-panel/30 px-4 py-2 text-sm"
                >
                  <span className="text-muted">{ev.trigger_type.replace(/_/g, " ")}</span>
                  <span className="text-dim">
                    {new Date(ev.timestamp * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-line/60 bg-panel/40 p-6">
          <h3 className="font-display text-lg font-medium">Suggestions</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {session.total_percentage_focused < 60 && (
              <li>• Try shorter sessions with fewer browser tabs open.</li>
            )}
            {session.distraction_event_count > 5 && (
              <li>• Consider enabling Do Not Disturb during focus blocks.</li>
            )}
            {stats.avg_recovery_seconds > 8 && (
              <li>• Your recovery time is high — try a 10-second reset when you notice drift.</li>
            )}
            {session.max_deep_focus_streak_minutes >= 15 && (
              <li>• Great deep focus streak — schedule demanding work in similar blocks.</li>
            )}
          </ul>
        </div>

        <div className="mt-10">
          <SignInCard variant="compact" />
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <Button href="/session">New Session</Button>
          <Button href="/history" variant="secondary">
            View History
          </Button>
          <Button variant="ghost" onClick={handleDelete}>
            Delete session
          </Button>
        </div>
      </main>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/40 bg-panel/40 p-4">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
