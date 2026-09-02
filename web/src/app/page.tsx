"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/layout/Nav";
import { SignInCard } from "@/components/auth/SignInCard";
import { Button } from "@/components/ui/Button";
import { loadProgress } from "@/lib/storage/db";
import type { UserProgress } from "@/types";

export default function HomePage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    loadProgress().then(setProgress);
  }, []);

  return (
    <>
      <Nav />
      <main>
        <section className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 py-20">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(22,243,162,0.15),transparent)]" />
            <div className="absolute left-1/4 top-1/3 h-64 w-64 animate-pulse rounded-full bg-emerald/5 blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 h-48 w-48 animate-pulse rounded-full bg-cyan/5 blur-3xl [animation-delay:1s]" />
          </div>

          {progress && progress.current_streak_days > 0 && (
            <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-sm text-emerald">
              <span>🔥</span> {progress.current_streak_days}-day focus streak
            </p>
          )}

          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-emerald/80">
            Privacy-first focus intelligence
          </p>
          <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            See your focus.
            <br />
            <span className="text-emerald">Train it.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            SmartFocus analyzes attention, gaze, and posture in real time — entirely in your
            browser. No video uploads. Just meaningful focus feedback and session analytics.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button href="/onboarding" size="lg">
              Start Focus Session
            </Button>
            <Button href="/history" variant="secondary" size="lg">
              View History
            </Button>
          </div>
        </section>

        <section className="border-y border-line/60 bg-panel/30 py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Calibrate once",
                body: "A guided calibration learns your neutral pose and screen gaze in under a minute.",
              },
              {
                step: "02",
                title: "Focus with live AI",
                body: "Real-time gaze, posture, and distraction detection with a cinematic session view.",
              },
              {
                step: "03",
                title: "Grow over time",
                body: "Streaks, goals, insights, and session analytics help you build lasting focus habits.",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-3">
                <span className="font-display text-3xl text-emerald/40">{item.step}</span>
                <h3 className="font-display text-xl font-medium">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold">Built for privacy</h2>
              <p className="mt-4 leading-relaxed text-muted">
                Camera frames are processed locally using MediaPipe. Only derived metrics —
                focus scores, gaze direction, posture state — are stored on your device.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted">
                <li>• No raw webcam footage stored or uploaded</li>
                <li>• Local IndexedDB session history</li>
                <li>• Optional Google sync for cross-device progress</li>
              </ul>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-line/60 bg-panel/50 p-8">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald/10 blur-2xl" />
              <div className="space-y-6">
                <FeatureRow label="Real-time Focus Score" value="0–100" />
                <FeatureRow label="Gaze & posture tracking" value="Live" />
                <FeatureRow label="Guided calibration" value="~15s" />
                <FeatureRow label="Streaks & goals" value="Built-in" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <SignInCard />
        </section>

        <section className="border-t border-line/60 bg-panel/20 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold">Ready to focus?</h2>
          <p className="mt-3 text-muted">Calibrate once, then start your first session.</p>
          <div className="mt-8">
            <Button href="/onboarding" size="lg">
              Get Started
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/50 pb-4 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-emerald">{value}</span>
    </div>
  );
}
