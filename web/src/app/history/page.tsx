"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/layout/Nav";
import { ScoreRing } from "@/components/analytics/ScoreRing";
import { getAllSessions } from "@/lib/storage/db";
import { formatMinutes } from "@/lib/utils";
import type { SessionSummary } from "@/types";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    getAllSessions().then(setSessions);
  }, []);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold">Session History</h1>
        <p className="mt-2 text-muted">Your locally stored focus sessions</p>

        {sessions.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-muted">No sessions yet.</p>
            <Link
              href="/session"
              className="mt-4 inline-block text-emerald hover:underline"
            >
              Start your first session
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            {sessions.map((session) => (
              <Link
                key={session.session_id}
                href={`/summary/${session.session_id}`}
                className="glass flex items-center justify-between rounded-2xl p-5 transition-colors hover:border-emerald/30"
              >
                <div>
                  <div className="font-medium">
                    {new Date(session.start_time * 1000).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {formatMinutes(session.total_duration_minutes)} ·{" "}
                    {session.total_percentage_focused.toFixed(0)}% focused ·{" "}
                    {session.distraction_event_count} distractions
                  </div>
                </div>
                <ScoreRing score={session.focus_score} size={72} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
