import type { TrackingMode } from "@/types";

export const TRACKING_MODE: TrackingMode = "CALIBRATED_THRESHOLDS";

export const LOW_ALPHA = 0.1;
export const HIGH_ALPHA = 0.7;
export const JITTER_MOTION_THRESHOLD = 0.003;
export const FAST_MOTION_THRESHOLD = 0.03;

export const FOCUS_THRESHOLD = 0.35;
export const YAW_THRESHOLD = 26;
export const PITCH_THRESHOLD = 15;
export const YAW_SIGN = 1;
export const HARD_SAFETY_YAW_LIMIT = 40;

export const CALIBRATION_COUNTDOWN_SECONDS = 3;
export const CALIBRATION_SAMPLES = 5;
export const DYNAMIC_CALIB_CORNERS = 4;

export const VECTOR_EMA_ALPHA = 0.2;
export const VELOCITY_THRESHOLD = 2.0;
export const VELOCITY_IGNORE_SECONDS = 0.15;
export const EYE_OFFSET_SCALE = 0.35;
export const EDGE_NEAR_THRESH = 0.08;

export const BLINK_FRAMES_THRESHOLD = 2;
export const BLINK_EAR_THRESHOLD = 0.21;
export const GAZE_EXTREME_LEFT = 0.8;
export const GAZE_EXTREME_RIGHT = 0.2;
export const GAZE_EXTREME_TOP = 0.25;
export const GAZE_EXTREME_BOTTOM = 0.75;

export const STATUS_DEBOUNCE_FRAMES = 4;
export const SOFT_YAW_THRESHOLD = 26;
export const PITCH_DOWN_THRESHOLD = 20;
export const SCORE_EMA_ALPHA = 0.15;
export const LOW_CONFIDENCE_THRESHOLD = 0.45;

export const GRACE_PERIOD_MS = 2000;
export const DISTRACTION_ALERT_SECONDS = 5;
export const SACCADE_THRESHOLD = 0.15;
export const INFERENCE_TARGET_FPS = 20;
export const UI_UPDATE_FPS = 10;

export const PNP_INDICES = [4, 152, 33, 263, 61, 291] as const;

export const MODEL_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0, -330, -65],
  [-225, 170, -135],
  [225, 170, -135],
  [-150, -150, -125],
  [150, -150, -125],
];

export const LEFT_EYE_CORNERS = { inner: 133, outer: 33 };
export const RIGHT_EYE_CORNERS = { inner: 362, outer: 263 };
export const LEFT_IRIS_CENTER = 468;
export const RIGHT_IRIS_CENTER = 473;
export const FOREHEAD_IDX = 10;
export const CHIN_IDX = 152;
export const NOSE_TIP_IDX = 4;
