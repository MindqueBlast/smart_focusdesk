import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { motion } from "framer-motion";
import { auth, db } from "../firebase";
import type { SessionSummary } from "../types";
import { useNavigate } from "react-router-dom";

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnalyticsHub() {
  const user = auth.currentUser;
  const navigate = useNavigate(); // 2. Initialize the navigation mechanism
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "sessions"), orderBy("start_time", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const next: SessionSummary[] = [];
      snap.forEach((doc) => next.push({ ...doc.data(), session_id: doc.id } as SessionSummary));
      setSessions(next);
      setLoading(false);
    });
    return unsub;
  }, [user]);
  
  const stats = useMemo(() => {
    const totalMinutes = sessions.reduce((sum, item) => sum + item.total_duration_minutes, 0);
    const totalDistractions = sessions.reduce((sum, item) => sum + item.distraction_event_count, 0);
    const averageScore =
      sessions.length > 0
        ? sessions.reduce((sum, item) => sum + item.focus_score, 0) / sessions.length
        : 0;
    const bestStreak = sessions.reduce(
      (max, item) => Math.max(max, item.max_deep_focus_streak_minutes),
      0
    );
    return { totalMinutes, totalDistractions, averageScore, bestStreak };
  }, [sessions]);

  const chartPoints = useMemo(() => {
    const recent = [...sessions].reverse().slice(-12);
    return recent.map((session, index) => {
      const x = recent.length <= 1 ? 0 : (index / (recent.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(100, session.focus_score));
      return `${x},${y}`;
    }).join(" ");
  }, [sessions]);

  return (
    <main className="analytics-page">
      <section className="analytics-header">
        <div>
          <p className="eyebrow">Analytics Hub</p>
          <h1>Long-range Focus</h1>
        </div>
        <span className="operator-pill">{sessions.length} sessions</span>
      </section>

      <section className="analytics-grid">
        <Metric label="Average Score" value={sessions.length ? stats.averageScore.toFixed(1) : "-"} unit="/100" />
        <Metric label="Tracked Time" value={formatMinutes(stats.totalMinutes)} />
        <Metric label="Distractions" value={stats.totalDistractions || "-"} />
        <Metric label="Best Deep Streak" value={formatMinutes(stats.bestStreak)} />
      </section>

      <section className="trend-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Trendline</p>
            <h2>Focus score trajectory</h2>
          </div>
          <span className="mode-chip">Last 12 sessions</span>
        </div>
        {sessions.length > 1 ? (
          <svg className="trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={chartPoints} />
          </svg>
        ) : (
          <div className="empty-analytics">Run at least two sessions to plot a trend.</div>
        )}
      </section>

      <section className="session-table">
        <div className="panel-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div>
            <p className="eyebrow">Session Archive</p>
            <h2>Recent deep dives</h2>
          </div>
          
          {/* 3. The direct routing button */}
          {sessions.length > 0 && (
            <button 
              onClick={() => navigate("/history")} // Changes route instantly
              className="mode-chip"
              style={{ 
                cursor: "pointer", 
                background: "#1e293b", 
                border: "none", 
                color: "#e5e7eb", 
                padding: "0.5rem 0.9rem", 
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 500,
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#2d3748")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1e293b")}
            >
              View Full Archive →
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-analytics">Loading sessions</div>
        ) : sessions.length === 0 ? (
          <div className="empty-analytics">No sessions recorded yet.</div>
        ) : (
          /* Keep your clean, original 8-row layout design */
          sessions.slice(0, 8).map((session, index) => (
            <motion.article
              className="session-row"
              key={session.session_id}
              layout
              initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: index * 0.025, type: "spring", duration: 0.28, bounce: 0 }}
            >
              <span>{formatDate(session.start_time)}</span>
              <strong>{session.focus_score.toFixed(1)}/100</strong>
              <span>{formatMinutes(session.total_duration_minutes)}</span>
              <span>{session.distraction_event_count} distractions</span>
              <span>{session.saccadic_density_score.toFixed(1)}/min</span>
            </motion.article>
          ))
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <motion.article className="metric-card" layout whileHover={{ y: -2 }} transition={{ type: "spring", duration: 0.22, bounce: 0 }}>
      <p>{label}</p>
      <strong>
        {value}
        {unit && <span>{unit}</span>}
      </strong>
    </motion.article>
  );
}
