"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Nav } from "@/components/layout/Nav";
import { Button } from "@/components/ui/Button";
import { loadSettings, saveSettings, exportSessionsJson } from "@/lib/storage/db";
import type { AppSettings, TrackingMode } from "@/types";

export default function SettingsPage() {
  const { user, configured, signIn, signOutUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    await saveSettings(settings);
    setSaved(true);
  };

  const handleExport = async () => {
    const json = await exportSessionsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smartfocus-sessions.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!settings) {
    return (
      <>
        <Nav />
        <main className="flex min-h-[60vh] items-center justify-center text-muted">
          Loading settings...
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>

        <div className="mt-10 space-y-8">
          <section className="space-y-4 rounded-2xl border border-line/60 bg-panel/40 p-6">
            <h2 className="font-medium">Tracking</h2>
            <label className="block text-sm text-muted">Tracking mode</label>
            <select
              className="w-full rounded-xl border border-line bg-panel px-4 py-2"
              value={settings.tracking_mode}
              onChange={(e) => update({ tracking_mode: e.target.value as TrackingMode })}
            >
              <option value="CALIBRATED_THRESHOLDS">Calibrated thresholds (tare)</option>
              <option value="DYNAMIC_MAPPING">Dynamic 4-corner mapping</option>
            </select>

            <label className="block text-sm text-muted">
              Sensitivity ({settings.sensitivity.toFixed(1)})
            </label>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={settings.sensitivity}
              onChange={(e) => update({ sensitivity: parseFloat(e.target.value) })}
              className="w-full"
            />

            <Button
              variant="secondary"
              onClick={() => {
                router.push("/session");
              }}
            >
              Recalibrate in session
            </Button>
          </section>

          <section className="space-y-4 rounded-2xl border border-line/60 bg-panel/40 p-6">
            <h2 className="font-medium">Goals</h2>
            <label className="block text-sm text-muted">
              Daily focus goal ({settings.daily_goal_minutes} min)
            </label>
            <input
              type="range"
              min={15}
              max={180}
              step={15}
              value={settings.daily_goal_minutes}
              onChange={(e) => update({ daily_goal_minutes: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <label className="block text-sm text-muted">
              Weekly session target ({settings.weekly_session_goal})
            </label>
            <input
              type="range"
              min={1}
              max={14}
              step={1}
              value={settings.weekly_session_goal}
              onChange={(e) => update({ weekly_session_goal: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <label className="block text-sm text-muted">
              Break reminder ({settings.break_reminder_minutes} min)
            </label>
            <input
              type="range"
              min={30}
              max={120}
              step={15}
              value={settings.break_reminder_minutes}
              onChange={(e) => update({ break_reminder_minutes: parseInt(e.target.value, 10) })}
              className="w-full"
            />
          </section>

          <section className="space-y-4 rounded-2xl border border-line/60 bg-panel/40 p-6">
            <h2 className="font-medium">Preferences</h2>
            <Toggle
              label="Reduced motion"
              checked={settings.reduced_motion}
              onChange={(v) => update({ reduced_motion: v })}
            />
            <Toggle
              label="Sound feedback"
              checked={settings.sound_enabled}
              onChange={(v) => update({ sound_enabled: v })}
            />
          </section>

          <section className="space-y-4 rounded-2xl border border-line/60 bg-panel/40 p-6">
            <h2 className="font-medium">Cloud sync</h2>
            {!configured ? (
              <p className="text-sm text-muted">
                Add Firebase env vars in Vercel to enable Google sign-in and cross-device session sync.
              </p>
            ) : authLoading ? (
              <p className="text-sm text-muted">Checking sign-in status...</p>
            ) : user ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Signed in as <span className="text-text">{user.email}</span>. Sessions sync
                  automatically and restore on new devices.
                </p>
                <Button variant="secondary" onClick={() => signOutUser()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Sign in with Google to sync sessions, streaks, and insights across devices.
                </p>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setAuthError(null);
                      await signIn();
                    } catch (err) {
                      setAuthError(err instanceof Error ? err.message : "Sign-in failed");
                    }
                  }}
                >
                  Sign in with Google
                </Button>
                {authError && <p className="text-sm text-crimson">{authError}</p>}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-line/60 bg-panel/40 p-6">
            <h2 className="font-medium">Privacy & data</h2>
            <p className="text-sm text-muted">
              All session data is stored locally in your browser. Export anytime.
            </p>
            <Button variant="secondary" onClick={handleExport}>
              Export sessions (JSON)
            </Button>
          </section>

          <div className="flex items-center gap-4">
            <Button onClick={handleSave}>Save settings</Button>
            {saved && <span className="text-sm text-emerald">Saved</span>}
          </div>
        </div>
      </main>
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-emerald" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
