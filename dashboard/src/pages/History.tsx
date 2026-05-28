import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import type { SessionSummary } from "../types";

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  let color = "#ef4444"; // Red < 50
  if (score >= 80) color = "#10b981"; // Emerald > 80
  else if (score >= 50) color = "#eab308"; // Yellow 50-80

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} className="progress-ring">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="progress-ring-circle"
        />
      </svg>
      <span style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 700,
        fontSize: size * 0.22,
        color,
        transform: "rotate(0deg)", // counteract SVG rotation for text
      }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

function formatDuration(mins: number): string {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${mins.toFixed(1)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const user = auth.currentUser;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "sessions"),
      orderBy("start_time", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data: SessionSummary[] = [];
      snap.forEach((doc) => data.push({ ...doc.data(), session_id: doc.id } as SessionSummary));
      setSessions(data);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  return (
    <div className="animate-fade-in" style={{ maxWidth: "960px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 600, color: "#e5e7eb", margin: 0 }}>
          Analytics Archive
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "0.35rem" }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
        </p>
      </div>

      {loading ? (
        <p style={{ color: "#4b5563", textAlign: "center", marginTop: "4rem" }}>Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: "6rem" }}>
          <p style={{ color: "#4b5563", fontSize: "0.9rem" }}>No sessions recorded yet.</p>
          <p style={{ color: "#374151", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            Run the local Python tracker to record your first focus session.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sessions.map((s, idx) => (
            <div
              key={s.session_id}
              className="bento-card animate-slide-up"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                animationDelay: `${idx * 0.06}s`,
                opacity: 0,
              }}
            >
              {/* Score ring */}
              <ScoreRing score={s.focus_score} />

              {/* Metrics */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#9ca3af", fontSize: "0.7rem", margin: "0 0 0.5rem", letterSpacing: "0.05em" }}>
                  {formatDate(s.start_time)}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", rowGap: "0.6rem" }}>
                  <Stat label="Focus" value={`${s.total_percentage_focused.toFixed(1)}%`} />
                  <Stat label="Duration" value={formatDuration(s.total_duration_minutes)} />
                  <Stat label="Distractions" value={String(s.distraction_event_count)} />
                  <Stat label="Saccadic Density" value={`${s.saccadic_density_score.toFixed(1)}/min`} />
                  <Stat label="Deep Streak" value={formatDuration(s.max_deep_focus_streak_minutes)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: "#4b5563", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.15rem" }}>{label}</p>
      <p style={{ color: "#e5e7eb", fontSize: "0.85rem", fontWeight: 500, margin: 0, fontFamily: "'Outfit', sans-serif" }}>{value}</p>
    </div>
  );
}
