import Dexie, { type Table } from "dexie";
import type { AppSettings, SessionSummary, StoredCalibration, UserProgress } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

export class SmartFocusDB extends Dexie {
  sessions!: Table<SessionSummary, string>;
  settings!: Table<{ key: string; value: AppSettings }, string>;
  calibration!: Table<{ key: string; value: StoredCalibration }, string>;
  progress!: Table<{ key: string; value: UserProgress }, string>;

  constructor() {
    super("SmartFocusDesk");
    this.version(1).stores({
      sessions: "session_id, start_time, focus_score",
      settings: "key",
    });
    this.version(2).stores({
      sessions: "session_id, start_time, focus_score",
      settings: "key",
      calibration: "key",
      progress: "key",
    });
  }
}

export const db = typeof window !== "undefined" ? new SmartFocusDB() : null;

export async function saveSession(summary: SessionSummary): Promise<void> {
  if (!db) return;
  await db.sessions.put(summary);
}

export async function getSession(sessionId: string): Promise<SessionSummary | undefined> {
  if (!db) return undefined;
  return db.sessions.get(sessionId);
}

export async function getAllSessions(): Promise<SessionSummary[]> {
  if (!db) return [];
  return db.sessions.orderBy("start_time").reverse().toArray();
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!db) return;
  await db.sessions.delete(sessionId);
}

export async function loadSettings(): Promise<AppSettings> {
  if (!db) return DEFAULT_SETTINGS;
  const row = await db.settings.get("app");
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!db) return;
  await db.settings.put({ key: "app", value: settings });
}

export async function saveCalibration(cal: StoredCalibration): Promise<void> {
  if (!db) return;
  await db.calibration.put({ key: "app", value: cal });
}

export async function loadCalibration(): Promise<StoredCalibration | null> {
  if (!db) return null;
  const row = await db.calibration.get("app");
  return row?.value ?? null;
}

const DEFAULT_PROGRESS: UserProgress = {
  current_streak_days: 0,
  longest_streak: 0,
  total_focus_minutes: 0,
  sessions_this_week: 0,
  last_session_date: null,
};

export async function loadProgress(): Promise<UserProgress> {
  if (!db) return DEFAULT_PROGRESS;
  const row = await db.progress.get("app");
  return row?.value ?? DEFAULT_PROGRESS;
}

export async function updateProgressAfterSession(durationMinutes: number): Promise<UserProgress> {
  const current = await loadProgress();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let streak = current.current_streak_days;
  if (current.last_session_date === today) {
    // same day, keep streak
  } else if (current.last_session_date === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const sessions = await getAllSessions();
  const sessionsThisWeek = sessions.filter(
    (s) => s.start_time * 1000 >= weekStart.getTime(),
  ).length;

  const updated: UserProgress = {
    current_streak_days: streak,
    longest_streak: Math.max(current.longest_streak, streak),
    total_focus_minutes: current.total_focus_minutes + durationMinutes,
    sessions_this_week: sessionsThisWeek,
    last_session_date: today,
  };

  if (db) await db.progress.put({ key: "app", value: updated });
  return updated;
}

export async function exportSessionsJson(): Promise<string> {
  const sessions = await getAllSessions();
  return JSON.stringify(sessions, null, 2);
}

export async function mergeSessionsFromCloud(sessions: SessionSummary[]): Promise<number> {
  if (!db) return 0;
  let merged = 0;
  for (const s of sessions) {
    const existing = await db.sessions.get(s.session_id);
    if (!existing) {
      await db.sessions.put(s);
      merged += 1;
    }
  }
  return merged;
}
