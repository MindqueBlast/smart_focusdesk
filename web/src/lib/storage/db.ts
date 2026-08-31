import Dexie, { type Table } from "dexie";
import type { AppSettings, SessionSummary } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

export class SmartFocusDB extends Dexie {
  sessions!: Table<SessionSummary, string>;
  settings!: Table<{ key: string; value: AppSettings }, string>;

  constructor() {
    super("SmartFocusDesk");
    this.version(1).stores({
      sessions: "session_id, start_time, focus_score",
      settings: "key",
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
  return row?.value ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!db) return;
  await db.settings.put({ key: "app", value: settings });
}

export async function exportSessionsJson(): Promise<string> {
  const sessions = await getAllSessions();
  return JSON.stringify(sessions, null, 2);
}
