import { create } from "zustand";
import type { AppSettings, FrameMetrics, SessionSummary } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { SessionEngine } from "@/lib/scoring/session-engine";

interface SessionStore {
  settings: AppSettings;
  metrics: FrameMetrics | null;
  sessionEngine: SessionEngine;
  isSessionActive: boolean;
  isPaused: boolean;
  sessionStartWall: number | null;
  lastSummary: SessionSummary | null;
  distractionTimerSec: number;
  setSettings: (settings: AppSettings) => void;
  setMetrics: (metrics: FrameMetrics) => void;
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: () => SessionSummary;
  setLastSummary: (summary: SessionSummary | null) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  metrics: null,
  sessionEngine: new SessionEngine(),
  isSessionActive: false,
  isPaused: false,
  sessionStartWall: null,
  lastSummary: null,
  distractionTimerSec: 0,

  setSettings: (settings) => set({ settings }),

  setMetrics: (metrics) => {
    const { sessionEngine, isSessionActive, isPaused } = get();
    if (isSessionActive && !isPaused) {
      sessionEngine.recordFrame(metrics);
    }

    const distractionTimerSec = sessionEngine.getSustainedDistractionSec(metrics.timestamp);

    set({
      metrics,
      distractionTimerSec,
      sessionEngine,
    });
  },

  startSession: () => {
    const engine = new SessionEngine();
    engine.start();
    set({
      sessionEngine: engine,
      isSessionActive: true,
      isPaused: false,
      sessionStartWall: Date.now(),
      distractionTimerSec: 0,
      metrics: null,
    });
  },

  pauseSession: () => set({ isPaused: true }),

  resumeSession: () => set({ isPaused: false }),

  stopSession: () => {
    const summary = get().sessionEngine.stop();
    set({
      isSessionActive: false,
      isPaused: false,
      sessionStartWall: null,
      lastSummary: summary,
      distractionTimerSec: 0,
    });
    return summary;
  },

  setLastSummary: (summary) => set({ lastSummary: summary }),
}));
