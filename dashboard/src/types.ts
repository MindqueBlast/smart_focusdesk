export interface UserProfile {
  lifetime_hours_focused: number;
  historical_focus_average: number;
  total_registered_distractions: number;
}

export interface DistractionEvent {
  timestamp: number;
  trigger_type: string;
  details?: Record<string, unknown>;
}

export interface SessionTick {
  timestamp: number;
  gaze: [number, number] | null;
  head_angle: {
    pitch: number;
    yaw: number;
    roll: number;
  };
  posture: {
    norm_s: number;
    slump_val: number;
  };
  status: string;
}

export interface SessionSummary {
  session_id: string;
  user_id: string;
  start_time: number;
  end_time: number;
  total_duration_seconds: number;
  total_duration_minutes: number;
  total_ticks: number;
  focused_ticks: number;
  total_percentage_focused: number;
  max_deep_focus_streak_minutes: number;
  saccade_count: number;
  saccadic_density_score: number;
  focus_score: number;
  distraction_event_count: number;
  distraction_events: DistractionEvent[];
  ticks?: SessionTick[]; // Only in local JSON backups, stripped from Firestore
}

export type LedHardware = "arduino" | "blink1";
export type TrackingMode = "CALIBRATED_THRESHOLDS" | "DYNAMIC_MAPPING";

export interface SessionRequest {
  uid: string;
  hardware: LedHardware;
  tracking_mode: TrackingMode;
}

export interface CalibrationState {
  state: string;
  corner_index: number;
  sample_count: number;
  corner_count: number;
  complete: boolean;
}

export interface LiveTelemetry {
  active: boolean;
  worker_active: boolean;
  session_id: string | null;
  session_started_at: number | null;
  uid: string | null;
  hardware: LedHardware | null;
  tracking_mode: TrackingMode | null;
  focus_score: number;
  status: string;
  distraction_count: number;
  slouch_factor: number;
  gaze: [number, number] | null;
  head_angle: {
    pitch: number;
    yaw: number;
    roll: number;
  };
  calibration: CalibrationState;
  updated_at: number;
  last_error: string | null;
}

export interface SessionActionResponse {
  active: boolean;
  worker_active: boolean;
  session_id?: string | null;
  status?: string;
  hardware?: LedHardware | null;
  tracking_mode?: TrackingMode | null;
  calibration?: CalibrationState;
  summary?: SessionSummary | null;
  last_error?: string | null;
}
