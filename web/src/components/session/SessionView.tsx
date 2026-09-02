"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/layout/Nav";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { CalibrationFlow } from "@/components/calibration/CalibrationFlow";
import { AnimatedScore } from "@/components/session/AnimatedScore";
import { StatePill } from "@/components/session/StatePill";
import { CameraPanel } from "@/components/session/CameraPanel";
import { GazeOverlay } from "@/components/session/GazeOverlay";
import { ActivityTimeline } from "@/components/session/ActivityTimeline";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { useCamera } from "@/hooks/useCamera";
import { useCVWorker } from "@/hooks/useCVWorker";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import { useSessionStore } from "@/stores/session-store";
import {
  saveSession,
  loadSettings,
  saveSettings,
  saveCalibration,
  loadCalibration,
  updateProgressAfterSession,
} from "@/lib/storage/db";
import { syncSessionToCloud } from "@/lib/storage/firebase";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  playCalibrationComplete,
  playDistractionNudge,
  playGoalReached,
  playSessionEnd,
} from "@/lib/audio/sounds";
import { formatDuration } from "@/lib/utils";
import type { CalibrationOffsets, FocusState, TrackingMode } from "@/types";

function cameraPanelStatus(
  cameraState: string,
  isPlaying: boolean,
): "idle" | "requesting" | "active" | "playing" | "error" {
  if (cameraState === "denied" || cameraState === "unavailable" || cameraState === "disconnected") {
    return "error";
  }
  if (cameraState === "requesting") return "requesting";
  if (isPlaying) return "playing";
  if (cameraState === "active") return "active";
  return "idle";
}

export default function SessionView() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    videoRef,
    setVideoRef,
    isVideoMounted,
    state: cameraState,
    error: cameraError,
    isPlaying,
    start,
    stop,
  } = useCamera();

  const {
    metrics,
    settings,
    isSessionActive,
    isPaused,
    sessionStartWall,
    sessionEngine,
    distractionTimerSec,
    setMetrics,
    setSettings,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
  } = useSessionStore();

  const [toast, setToast] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [showCalibration, setShowCalibration] = useState(true);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(60);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const lastFocusState = useRef<FocusState | null>(null);
  const calibCompletePlayed = useRef(false);

  const onCalibrationSaved = useCallback(
    async (offsets: CalibrationOffsets, mode: TrackingMode) => {
      await saveCalibration({ offsets, tracking_mode: mode, calibrated_at: Date.now() / 1000 });
      const s = await loadSettings();
      await saveSettings({ ...s, calibration_complete: true });
      setCalibrated(true);
      if (soundEnabled && !calibCompletePlayed.current) {
        playCalibrationComplete();
        calibCompletePlayed.current = true;
      }
    },
    [soundEnabled],
  );

  const onMetrics = useCallback(
    (m: Parameters<typeof setMetrics>[0]) => setMetrics(m),
    [setMetrics],
  );

  const cv = useCVWorker(onMetrics, onCalibrationSaved);

  useEffect(() => {
    loadSettings().then(async (s) => {
      setSettings(s);
      setDailyGoalMinutes(s.daily_goal_minutes);
      setSoundEnabled(s.sound_enabled);
      cv.setTrackingMode(s.tracking_mode);
      cv.setSensitivity(s.sensitivity);
      cv.setBreakReminder(s.break_reminder_minutes);

      const cal = await loadCalibration();
      if (cal) {
        cv.loadCalibration(cal.offsets, cal.tracking_mode);
        setCalibrated(true);
        if (s.calibration_complete) setShowCalibration(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isVideoMounted) return;
    let cancelled = false;

    async function boot() {
      await start();
      if (cancelled) return;
      await cv.init();
      if (cancelled) return;
      setInitialized(true);
    }

    void boot();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoMounted]);

  useFrameLoop(videoRef, initialized && cv.state === "ready" && !isPaused, cv.sendFrame);

  useEffect(() => {
    if (!isSessionActive || !sessionStartWall) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartWall) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isSessionActive, sessionStartWall]);

  useEffect(() => {
    if (!metrics || !isSessionActive) return;

    if (metrics.focusState !== lastFocusState.current) {
      if (
        soundEnabled &&
        (metrics.focusState === "Highly Distracted" || metrics.focusState === "Looking Away")
      ) {
        playDistractionNudge();
      }
      lastFocusState.current = metrics.focusState;
    }

    if (metrics.focusState === "Highly Distracted") {
      setToast("Attention drifting — gently return to your task");
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
    if (metrics.focusState === "Poor Posture") {
      setToast("Posture check — sit up and align with your screen");
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
    if (metrics.focusState === "Take a Break") {
      setToast("You've been at it a while — consider a short break");
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [metrics?.focusState, isSessionActive, metrics, soundEnabled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && isSessionActive) {
        e.preventDefault();
        isPaused ? resumeSession() : pauseSession();
      }
      if (e.key === "c" || e.key === "C") {
        setShowCalibration(true);
        cv.startCalibration();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSessionActive, isPaused, pauseSession, resumeSession, cv]);

  const handleStart = () => {
    startSession();
    cv.sessionStart();
    calibCompletePlayed.current = false;
  };

  const handleStop = async () => {
    cv.sessionStop();
    const summary = stopSession();
    summary.user_id = user?.uid ?? "local";
    await saveSession(summary);
    await updateProgressAfterSession(summary.total_duration_minutes);
    if (soundEnabled) playSessionEnd();
    if (summary.total_duration_minutes >= dailyGoalMinutes && soundEnabled) playGoalReached();
    if (user) {
      try {
        await syncSessionToCloud(user.uid, summary);
      } catch {
        // best-effort
      }
    }
    router.push(`/summary/${summary.session_id}`);
  };

  const focusState: FocusState = metrics?.focusState ?? "Focused";
  const currentScore = metrics?.current_focus_score ?? 0;
  const sessionScore = sessionEngine.sessionFocusScore;
  const panelStatus = cameraPanelStatus(cameraState, isPlaying);
  const goalProgress = Math.min(100, (elapsed / 60 / dailyGoalMinutes) * 100);

  if (cameraState === "denied" || cameraState === "unavailable") {
    return (
      <>
        <Nav />
        <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-2xl font-semibold">Camera unavailable</h1>
          <p className="mt-4 text-muted">{cameraError}</p>
          <Button className="mt-8" onClick={() => start()}>
            Retry
          </Button>
        </main>
      </>
    );
  }

  return (
    <>
      <AmbientBackground focusState={focusState} reducedMotion={settings.reduced_motion} />
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {cv.state === "loading" && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line/60 bg-panel/50 px-4 py-3 text-sm text-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald border-t-transparent" />
            {cv.loadMessage || "Loading vision models..."}
          </div>
        )}

        {cv.state === "error" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">
            <span>Model failed to load: {cv.error}</span>
            <Button variant="secondary" size="sm" onClick={() => cv.init()}>
              Retry
            </Button>
          </div>
        )}

        {showCalibration && !isSessionActive ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="relative">
              <CameraPanel
                videoRef={setVideoRef}
                className="aspect-video w-full"
                status={panelStatus}
                overlay={<GazeOverlay metrics={metrics} />}
              />
              {metrics?.tracking_quality?.lowLight && (
                <p className="mt-2 text-center text-sm text-amber">Low light — improve lighting for best results</p>
              )}
            </div>
            <CalibrationFlow
              metrics={metrics}
              trackingMode={settings.tracking_mode}
              onStartCalibration={() => {
                calibCompletePlayed.current = false;
                cv.startCalibration();
              }}
              onComplete={() => setShowCalibration(false)}
            />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <div className="relative">
                <CameraPanel
                  videoRef={setVideoRef}
                  className="aspect-video w-full"
                  dimmed={isPaused}
                  status={panelStatus}
                  overlay={
                    <>
                      <GazeOverlay metrics={metrics} />
                      {cv.state !== "ready" ? (
                        <div className="rounded-xl bg-page/70 px-4 py-2 text-sm text-muted">
                          Initializing vision engine...
                        </div>
                      ) : !metrics?.face_detected ? (
                        <div className="rounded-xl bg-page/70 px-4 py-2 text-sm text-amber">
                          Step into frame
                        </div>
                      ) : metrics.face_count > 1 ? (
                        <div className="rounded-xl bg-page/70 px-4 py-2 text-sm text-crimson">
                          Only one person please
                        </div>
                      ) : null}
                    </>
                  }
                />
              </div>
              <ActivityTimeline ticks={sessionEngine.ticks} durationSec={elapsed} />
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <AnimatedScore value={currentScore} label="Current Focus" />
                <AnimatedScore value={sessionScore} label="Session" size="md" />
              </div>

              {isSessionActive && (
                <div className="flex items-center gap-4">
                  <ProgressRing value={goalProgress} size={56} stroke={4} label={`${Math.round(goalProgress)}%`} />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-dim">Daily goal</p>
                    <p className="text-sm text-muted">
                      {Math.floor(elapsed / 60)} / {dailyGoalMinutes} min
                    </p>
                  </div>
                </div>
              )}

              <StatePill state={focusState} />

              <div className="grid grid-cols-2 gap-4">
                <Stat label="Duration" value={formatDuration(elapsed)} />
                <Stat
                  label="Distraction"
                  value={
                    distractionTimerSec > 0
                      ? formatDuration(Math.floor(distractionTimerSec))
                      : "—"
                  }
                />
                <Stat
                  label="Posture"
                  value={
                    metrics?.posture.effective_s !== undefined
                      ? metrics.posture.effective_s < 0.35
                        ? "Good"
                        : "Slouching"
                      : "—"
                  }
                />
                <Stat
                  label="Tracking"
                  value={
                    metrics?.confidence
                      ? `${Math.round(metrics.confidence * 100)}%`
                      : "—"
                  }
                />
              </div>

              <div className="mt-auto flex flex-wrap gap-3">
                {!isSessionActive ? (
                  <Button
                    size="lg"
                    onClick={handleStart}
                    disabled={cv.state !== "ready" || (!calibrated && !settings.calibration_complete)}
                  >
                    Start Focus Session
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => (isPaused ? resumeSession() : pauseSession())}
                    >
                      {isPaused ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowCalibration(true);
                        cv.startCalibration();
                      }}
                    >
                      Recalibrate
                    </Button>
                    <Button variant="danger" onClick={handleStop}>
                      End Session
                    </Button>
                  </>
                )}
                {!calibrated && !isSessionActive && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowCalibration(true)}
                  >
                    Calibrate first
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Toast message={toast} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/40 bg-panel/40 p-4 backdrop-blur">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
