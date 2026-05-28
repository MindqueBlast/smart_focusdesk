import { useEffect, useMemo, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import type {
  LedHardware,
  LiveTelemetry,
  SessionActionResponse,
  SessionRequest,
  SessionSummary,
  TrackingMode,
  UserProfile,
} from "../types";

const LOCAL_AGENT_URL = "http://localhost:8000";
const VIDEO_FEED_URL = `${LOCAL_AGENT_URL}/session/video-feed`;

const idleTelemetry: LiveTelemetry = {
  active: false,
  worker_active: false,
  session_id: null,
  session_started_at: null,
  uid: null,
  hardware: null,
  tracking_mode: null,
  focus_score: 0,
  status: "IDLE",
  distraction_count: 0,
  slouch_factor: 0,
  gaze: null,
  head_angle: { pitch: 0, yaw: 0, roll: 0 },
  calibration: {
    state: "idle",
    corner_index: 0,
    sample_count: 0,
    corner_count: 0,
    complete: false,
  },
  updated_at: Date.now() / 1000,
  last_error: null,
};

async function localAgentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${LOCAL_AGENT_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Local agent returned ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.detail ?? message;
    } catch {
      // Keep status-derived message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function isFocusBreak(status: string): boolean {
  const normalized = status.toUpperCase();
  return [
    "LOOKING AWAY",
    "LOOKING LEFT",
    "LOOKING RIGHT",
    "LOOKING DOWN",
    "FACE LOST",
    "SLOUCHING",
    "EYES CLOSED",
    "GAZE AWAY",
    "ERROR",
  ].some((state) => normalized.includes(state));
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m ${secs}s`;
}

export default function Dashboard() {
  const user = auth.currentUser;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hardware, setHardware] = useState<LedHardware>("arduino");
  const [trackingMode, setTrackingMode] =
    useState<TrackingMode>("CALIBRATED_THRESHOLDS");
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(idleTelemetry);
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!telemetry.active && !telemetry.worker_active) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await localAgentRequest<LiveTelemetry>("/session/live-telemetry");
        if (!cancelled) {
          setTelemetry(next);
          setAgentError(next.last_error);
        }
      } catch (error) {
        if (!cancelled) {
          setAgentError(error instanceof Error ? error.message : "Unable to reach local agent.");
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [telemetry.active, telemetry.worker_active]);

  const requestBody = (): SessionRequest => {
    if (!user?.uid) throw new Error("Sign in before starting the local agent.");
    return { uid: user.uid, hardware, tracking_mode: trackingMode };
  };

  const handleStartStop = async () => {
    setIsBusy(true);
    setAgentError(null);
    try {
      if (telemetry.active) {
        const stopped = await localAgentRequest<SessionActionResponse>("/session/stop", {
          method: "POST",
        });
        setLastSummary(stopped.summary ?? null);
        setTelemetry({
          ...idleTelemetry,
          focus_score: stopped.summary?.focus_score ?? telemetry.focus_score,
          distraction_count:
            stopped.summary?.distraction_event_count ?? telemetry.distraction_count,
          session_id: stopped.summary?.session_id ?? telemetry.session_id,
          status: stopped.summary ? "SAVED" : "IDLE",
        });
      } else {
        const started = await localAgentRequest<SessionActionResponse>("/session/start", {
          method: "POST",
          body: JSON.stringify(requestBody()),
        });
        setLastSummary(null);
        setVideoReady(false);
        setTelemetry({
          ...idleTelemetry,
          active: started.active,
          worker_active: started.worker_active,
          session_id: started.session_id ?? null,
          hardware: started.hardware ?? hardware,
          tracking_mode: started.tracking_mode ?? trackingMode,
          calibration: started.calibration ?? idleTelemetry.calibration,
          status: started.status ?? "STARTING",
        });
      }
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "Local agent request failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCalibrate = async () => {
    setIsBusy(true);
    setAgentError(null);
    try {
      const calibrated = await localAgentRequest<SessionActionResponse>("/session/calibrate", {
        method: "POST",
        body: JSON.stringify(requestBody()),
      });
      setVideoReady(false);
      setTelemetry({
        ...telemetry,
        worker_active: calibrated.worker_active,
        active: calibrated.active,
        hardware: calibrated.hardware ?? hardware,
        tracking_mode: calibrated.tracking_mode ?? trackingMode,
        calibration: calibrated.calibration ?? telemetry.calibration,
        status: calibrated.status ?? "CALIBRATING",
      });
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "Calibration request failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const settingsLocked = telemetry.active || telemetry.worker_active || isBusy;
  const showVideo = telemetry.active || telemetry.worker_active;
  const alerting = telemetry.active && isFocusBreak(telemetry.status);
  const themeClass = alerting
    ? "theme-alert"
    : telemetry.active
      ? "theme-focused"
      : telemetry.worker_active
        ? "theme-calibrating"
        : "theme-idle";

  const sessionSeconds = useMemo(() => {
    if (telemetry.active && telemetry.session_started_at) {
      return Math.max(0, Date.now() / 1000 - telemetry.session_started_at);
    }
    if (lastSummary) return lastSummary.total_duration_seconds;
    return (profile?.lifetime_hours_focused ?? 0) * 3600;
  }, [lastSummary, profile?.lifetime_hours_focused, telemetry]);

  const focusScore =
    telemetry.active || lastSummary
      ? lastSummary?.focus_score ?? telemetry.focus_score
      : profile?.historical_focus_average ?? 0;
  const distractions =
    telemetry.active || lastSummary
      ? lastSummary?.distraction_event_count ?? telemetry.distraction_count
      : profile?.total_registered_distractions ?? 0;

  return (
    <main className={`deck-page ${themeClass}`}>
      <section className="deck-command">
        <motion.div className="deck-title" layout>
          <p className="eyebrow">Control Deck</p>
          <h1>{alerting ? "Attention break detected" : ""}</h1>
        </motion.div>
        <motion.div className="operator-pill" layout>
          <span className="operator-dot" />
          <span>{telemetry.active ? telemetry.status : telemetry.worker_active ? "CALIBRATING" : "READY"}</span>
        </motion.div>
      </section>

      <section className="tactical-grid">
        <motion.article className="control-bay neon-panel" layout>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Configuration Bay</p>
              <h2>{settingsLocked ? "Locked runtime" : "Settings"}</h2>
            </div>
            <span className="mode-chip">{settingsLocked ? "Read-only" : "Editable"}</span>
          </div>

          <div className={`config-stack ${settingsLocked ? "is-locked" : ""}`}>
            <label>
              <span>LED Hardware</span>
              {settingsLocked ? (
                <strong>{telemetry.hardware ?? hardware}</strong>
              ) : (
                <select value={hardware} onChange={(event) => setHardware(event.target.value as LedHardware)}>
                  <option value="arduino">Arduino</option>
                  <option value="blink1">Blink(1)</option>
                </select>
              )}
            </label>
            <label>
              <span>Tracking Mode</span>
              {settingsLocked ? (
                <strong>{telemetry.tracking_mode ?? trackingMode}</strong>
              ) : (
                <select value={trackingMode} onChange={(event) => setTrackingMode(event.target.value as TrackingMode)}>
                  <option value="CALIBRATED_THRESHOLDS">Calibrated Thresholds</option>
                  <option value="DYNAMIC_MAPPING">Dynamic Mapping</option>
                </select>
              )}
            </label>
          </div>

          <div className="action-row">
            <motion.button
              className="primary-action"
              onClick={handleStartStop}
              disabled={isBusy}
              whileTap={{ scale: 0.985 }}
            >
              {telemetry.active ? "End Focus Session" : "Start Focus Session"}
            </motion.button>
            <motion.button
              className="secondary-action"
              onClick={handleCalibrate}
              disabled={isBusy || telemetry.active}
              whileTap={{ scale: 0.985 }}
            >
              Calibrate Desk
            </motion.button>
          </div>
          {agentError && <p className="agent-error">{agentError}</p>}
        </motion.article>

        <motion.article className="video-panel neon-panel" layout>
          <div className="video-topbar">
            <span>Live Feed</span>
            <span>{videoReady ? "Streaming" : showVideo ? "Syncing" : "Standby"}</span>
          </div>
          {showVideo ? (
            <img
              className={`video-feed ${videoReady ? "is-ready" : ""}`}
              src={VIDEO_FEED_URL}
              alt="Live webcam feed with MediaPipe tracking overlay"
              onLoad={() => setVideoReady(true)}
              onError={() => {
                setVideoReady(false);
                setAgentError("Video stream is not available from the local agent.");
              }}
            />
          ) : (
            <div className="video-standby">
              <span>Video feed opens during calibration or live tracking.</span>
            </div>
          )}
        </motion.article>
      </section>

      <section className="metric-grid">
        <DataTile label={telemetry.active || lastSummary ? "Session Duration" : "Lifetime Focus"} textValue={telemetry.active || lastSummary ? formatDuration(sessionSeconds) : `${(profile?.lifetime_hours_focused ?? 0).toFixed(1)} hrs`} />
        <DataTile label="Focus Score" value={focusScore} suffix="/100" decimals={1} />
        <DataTile label="Distractions" value={distractions} decimals={0} />
        <DataTile label="Slouch Factor" value={telemetry.slouch_factor} decimals={3} />
      </section>

      <section className="telemetry-strip">
        <TelemetryItem label="Calibration" value={telemetry.calibration.state} />
        <TelemetryItem label="Corners" value={`${telemetry.calibration.corner_count}/4`} />
        <TelemetryItem label="Pitch" value={telemetry.head_angle.pitch.toFixed(1)} />
        <TelemetryItem label="Yaw" value={telemetry.head_angle.yaw.toFixed(1)} />
      </section>
    </main>
  );
}

function DataTile({
  label,
  value,
  textValue,
  suffix,
  decimals = 0,
}: {
  label: string;
  value?: number;
  textValue?: string;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <motion.article className="metric-card" layout whileHover={{ y: -2 }} transition={{ type: "spring", duration: 0.22, bounce: 0 }}>
      <p>{label}</p>
      <strong>
        {textValue ?? <RollingNumber value={value ?? 0} decimals={decimals} />}
        {suffix && <span>{suffix}</span>}
      </strong>
    </motion.article>
  );
}

function RollingNumber({ value, decimals }: { value: number; decimals: number }) {
  const spring = useSpring(value, { stiffness: 180, damping: 24, mass: 0.7 });
  const display = useTransform(spring, (latest) => latest.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className="rolling-number">{display}</motion.span>;
}

function TelemetryItem({ label, value }: { label: string; value: string }) {
  return (
    <motion.div layout>
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}
