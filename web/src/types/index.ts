export type TrackingMode = "CALIBRATED_THRESHOLDS" | "DYNAMIC_MAPPING";

export type InternalStatus =
  | "FOCUSED"
  | "GAZE AWAY"
  | "EYES CLOSED"
  | "LOOKING LEFT"
  | "LOOKING RIGHT"
  | "LOOKING AWAY"
  | "LOOKING DOWN"
  | "SLOUCHING"
  | "NO FACE"
  | "FACE LOST";

export type FocusState =
  | "Focused"
  | "Slightly Distracted"
  | "Looking Away"
  | "Poor Posture"
  | "Highly Distracted"
  | "Take a Break";

export interface HeadAngle {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface PostureMetrics {
  norm_s: number;
  slump_val: number;
  effective_s: number;
}

export interface GazeMetrics {
  horizontal_ratio: number | null;
  vertical_ratio: number | null;
  is_blinking: boolean;
  pupils_located: boolean;
}

export interface FrameMetrics {
  timestamp: number;
  status: InternalStatus;
  focusState: FocusState;
  head_angle: HeadAngle;
  posture: PostureMetrics;
  gaze: GazeMetrics;
  gaze_coord: [number, number] | null;
  current_focus_score: number;
  face_detected: boolean;
  face_count: number;
  confidence: number;
  calibration: CalibrationState;
  tracking_quality?: TrackingQuality;
}

export interface TrackingQuality {
  confidence: number;
  lowLight: boolean;
  faceCentered: boolean;
  faceDistance: "too_close" | "too_far" | "good";
}

export interface CalibrationState {
  state: string;
  stage: string;
  corner_index: number;
  sample_count: number;
  corner_count: number;
  complete: boolean;
  progress_pct: number;
  position_ok: boolean;
  quality: number;
  countdown_remaining?: number;
}

export interface CalibrationOffsets {
  offset_pitch: number;
  offset_yaw: number;
  offset_s: number;
  dynamic_corners: [number, number][];
}

export interface SessionTick {
  timestamp: number;
  gaze: [number, number] | null;
  head_angle: HeadAngle;
  posture: PostureMetrics;
  status: InternalStatus;
  focus_state: FocusState;
  focus_score: number;
}

export interface DistractionEvent {
  timestamp: number;
  trigger_type: string;
  details?: Record<string, unknown>;
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
  peak_focus_score: number;
  avg_focus_score: number;
  distraction_event_count: number;
  distraction_events: DistractionEvent[];
  ticks: SessionTick[];
}

export interface AppSettings {
  tracking_mode: TrackingMode;
  sensitivity: number;
  sound_enabled: boolean;
  reduced_motion: boolean;
  onboarding_complete: boolean;
  break_reminder_minutes: number;
  daily_goal_minutes: number;
  weekly_session_goal: number;
  calibration_complete: boolean;
}

export interface StoredCalibration {
  offsets: CalibrationOffsets;
  tracking_mode: TrackingMode;
  calibrated_at: number;
}

export interface UserProgress {
  current_streak_days: number;
  longest_streak: number;
  total_focus_minutes: number;
  sessions_this_week: number;
  last_session_date: string | null;
}

export interface Insight {
  id: string;
  text: string;
  category: "focus" | "posture" | "distraction" | "timing";
  priority: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  tracking_mode: "CALIBRATED_THRESHOLDS",
  sensitivity: 1.0,
  sound_enabled: false,
  reduced_motion: false,
  onboarding_complete: false,
  break_reminder_minutes: 90,
  daily_goal_minutes: 60,
  weekly_session_goal: 5,
  calibration_complete: false,
};
