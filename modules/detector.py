import os
import cv2
import mediapipe as mp
import time
import numpy as np  # Added for 3D pose matrix math
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from modules.attention import AttentionMixin
from modules.calibration import CalibrationMixin
from modules.detector_math import DetectorMathMixin
from modules.gaze_tracking_adapter import GazeTrackingAdapter
from modules.hud_renderer import HudRendererMixin


class FaceDetector(CalibrationMixin, DetectorMathMixin, HudRendererMixin, AttentionMixin):
    # --- Configuration Constants ---
    LOW_ALPHA = 0.1
    HIGH_ALPHA = 0.7
    JITTER_MOTION_THRESHOLD = 0.003
    FAST_MOTION_THRESHOLD = 0.03
    FOCUS_THRESHOLD = 0.35  # The 'S-Factor' boundary
    YAW_THRESHOLD = 26
    PITCH_THRESHOLD = 15
    YAW_SIGN = 1  # set to 1 or -1 so positive horizontal motion means physical right
    POINTER_STRENGTH = 5  # How far the nose line projects
    CALIBRATION_COUNTDOWN_SECONDS = 3
    CALIBRATION_SAMPLES = 5
    DISTRACTION_ALERT_SECONDS = 5.0
    ALERT_FLASH_PERIOD_SECONDS = 0.4
    # Dynamic mapping / vector stability
    VECTOR_EMA_ALPHA = 0.2
    VELOCITY_THRESHOLD = 2.0  # units/sec on projected coords
    VELOCITY_IGNORE_SECONDS = 0.150
    EYE_OFFSET_SCALE = 0.35
    DYNAMIC_CALIB_CORNERS = 4
    USE_MESH_FALLBACK = False

    # GazeTracking supplies eye status and pupil ratios; MediaPipe remains head pose only.
    HARD_SAFETY_YAW_LIMIT = 40          # Maximum physical neck turn allowed

    # HUD palette (BGR)
    _HUD_BG = (42, 46, 52)
    _HUD_BORDER = (72, 168, 255)
    _HUD_MUTED = (140, 145, 150)
    _HUD_TEXT = (248, 250, 252)
    _HUD_ACCENT = (100, 200, 255)
    _HUD_GOOD = (120, 220, 140)
    _HUD_WARN = (80, 200, 255)
    _HUD_BAD = (96, 96, 255)
    _HUD_INFO = (255, 210, 110)
    _MESH_DIM = (48, 90, 48)
    _MESH_KEY = (0, 220, 255)
    _MESH_KEY_RING = (80, 255, 140)
    DRAW_FULL_MESH = True

    def __init__(self, tracking_mode="CALIBRATED_THRESHOLDS"):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(current_dir)
        model_path = os.path.join(project_root, "models", "face_landmarker.task")

        self.previous_landmarks = None
        self.tracking_mode = tracking_mode

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.8,
        )
        self.detector = vision.FaceLandmarker.create_from_options(options)

        # 4: Tip, 168: High Bridge, 152: Chin, 10: Forehead, 33/133/362/263: Eyes
        self.key_indices = [4, 168, 152, 10, 33, 133, 362, 263, 61, 291]

        # Specific indices for solvePnP (Nose, Chin, L Eye, R Eye, L Mouth, R Mouth)
        self.pnp_indices = [4, 152, 33, 263, 61, 291]

        # 3D Model Points from the LearnOpenCV article
        self.model_points = np.array(
            [
                (0.0, 0.0, 0.0),  # Nose tip
                (0.0, -330.0, -65.0),  # Chin
                (-225.0, 170.0, -135.0),  # Left eye left corner
                (225.0, 170.0, -135.0),  # Right eye right corner
                (-150.0, -150.0, -125.0),  # Left Mouth corner
                (150.0, -150.0, -125.0),  # Right mouth corner
            ]
        )

        self.show_analysis_panel = True
        self._last_face_hud = None  # set each frame when a face is tracked
        self._panel_toggle_ts = 0.0
        self.offset_yaw = 0.0
        self.offset_pitch = 0.0
        self.offset_s = 0.0
        self._calibration_state = "idle"  # idle | countdown | sampling
        # Dynamic mapping state: will use values 'idle' | 'corner_countdown' | 'corner_sampling'
        self._dynamic_corner_idx = 0
        self.dynamic_corners = []  # saved projected 2D combined gaze points for corners
        self._last_combined_vec = None
        self._last_combined_ts = 0.0
        self._combined_vec_stable = None
        self._ignore_until = 0.0
        self._calibration_started_at = 0.0
        self._calibration_samples = []
        self._calibration_done_until = 0.0
        self.total_focus_time = 0.0
        self.total_distracted_time = 0.0
        self._last_attention_ts = time.monotonic()
        self._consecutive_distraction_time = 0.0
        self._alert_active = False
        self._alert_sound_played = False
        self._last_normalized_screen_coord = None  # Store normalized screen coordinate for display
        self.last_pitch = 0.0
        self.last_yaw = 0.0
        self.last_roll = 0.0
        self.last_norm_s = 0.0
        self.last_status = "NO FACE"
        self.last_gaze_coord = None
        self.gaze = GazeTrackingAdapter()
        self._last_gaze_state = self.gaze.metrics()
        if not self.gaze.available:
            print(f"Warning: GazeTracking unavailable: {self.gaze.error}")
        self._last_gaze_error_ts = 0.0
        self._last_gaze_status_ts = 0.0
        self._last_mesh_fallback = None
        self._mesh_fallback_alpha = 0.18
        self._blink_frames = 0
        self._blink_frames_threshold = 2

    def get_normalized_screen_coord(self):
        """Return the last computed normalized screen coordinate (x, y) or None."""
        return self._last_normalized_screen_coord

    def toggle_analysis_panel(self):
        now = time.monotonic()
        if now - self._panel_toggle_ts < 0.22:
            return
        self._panel_toggle_ts = now
        self.show_analysis_panel = not self.show_analysis_panel

    def refresh_gaze(self, frame):
        self.gaze.refresh(frame)
        self._last_gaze_state = self.gaze.metrics()
        # Throttled logging of adapter errors to aid debugging
        err = self._last_gaze_state.get("error")
        now = time.monotonic()
        if err and now - self._last_gaze_error_ts > 1.0:
            print(f"Gaze adapter error: {err}")
            self._last_gaze_error_ts = now
        # If external calibration completes, mark it for UI feedback (do not cancel local calibration)
        try:
            if getattr(self.gaze, "available", False) and getattr(self.gaze, "calibration_complete", lambda: False)():
                if not getattr(self, "_external_calibrated", False):
                    print("External gaze calibration completed")
                    self._external_calibrated = True
                    self._external_calibrated_ts = time.monotonic()
                    # if external calibration just completed, display transient message
                    if time.monotonic() - self._external_calibrated_ts < 2.0:
                        cv2.putText(frame, "Gaze cal: COMPLETE", (10, 45), font, 0.6, (120, 255, 140), 2)
        except Exception:
            pass
        return self._last_gaze_state

    def _estimate_pupil_ratios_from_mesh(self, face_landmarks, frame):
        """
        Quick fallback pupil estimator using MediaPipe face landmarks.
        Returns (horizontal_ratio, vertical_ratio, pupils_located) or (None, None, False).
        """
        h, w = frame.shape[:2]
        # Eye corner landmark indices (MediaPipe FaceMesh): left eye (33, 133), right eye (362, 263)
        try:
            left_l = face_landmarks[33]
            left_r = face_landmarks[133]
            right_l = face_landmarks[362]
            right_r = face_landmarks[263]
        except Exception:
            return (None, None, False)

        def pupil_from_eye(pt_l, pt_r):
            x_l = int(pt_l.x * w)
            y_l = int(pt_l.y * h)
            x_r = int(pt_r.x * w)
            y_r = int(pt_r.y * h)
            # bounding box with a larger margin for more stable ROI
            margin = 14
            min_x = max(min(x_l, x_r) - margin, 0)
            max_x = min(max(x_l, x_r) + margin, w)
            min_y = max(min(y_l, y_r) - margin, 0)
            max_y = min(max(y_l, y_r) + margin, h)
            if max_x - min_x < 10 or max_y - min_y < 10:
                return None
            roi = frame[min_y:max_y, min_x:max_x]
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)
            _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return None

            eye_cx = (max_x - min_x) / 2.0
            eye_cy = (max_y - min_y) / 2.0
            candidates = []
            for c in contours:
                area = cv2.contourArea(c)
                if area < 15:
                    continue
                M = cv2.moments(c)
                if M.get("m00", 0) == 0:
                    continue
                cx = float(M["m10"] / M["m00"])
                cy = float(M["m01"] / M["m00"])
                dist = (cx - eye_cx) ** 2 + (cy - eye_cy) ** 2
                candidates.append((area, dist, cx, cy))

            if not candidates:
                return None
            candidates.sort(key=lambda item: (-item[0], item[1]))
            cx = int(candidates[0][2])
            cy = int(candidates[0][3])
            return (cx, cy, max_x - min_x, max_y - min_y)

        left_p = pupil_from_eye(left_l, left_r)
        right_p = pupil_from_eye(right_l, right_r)
        if left_p is None or right_p is None:
            return (None, None, False)

        # Map to same convention as GazeTracking: extreme right=0.0, center=0.5, extreme left=1.0
        lx, ly, lwid, lhei = left_p
        rx, ry, rwid, rhei = right_p
        left_ratio_h = 1.0 - (lx / float(lwid))
        right_ratio_h = (rx / float(rwid))
        horizontal_ratio = (left_ratio_h + right_ratio_h) / 2.0

        left_ratio_v = ly / float(lhei)
        right_ratio_v = ry / float(rhei)
        vertical_ratio = (left_ratio_v + right_ratio_v) / 2.0

        return (float(horizontal_ratio), float(vertical_ratio), True)

    def _smooth_mesh_ratios(self, hratio, vratio):
        if hratio is None or vratio is None:
            self._last_mesh_fallback = None
            return (None, None)
        raw = np.array([hratio, vratio], dtype=float)
        if self._last_mesh_fallback is None:
            self._last_mesh_fallback = raw
        else:
            self._last_mesh_fallback = (
                self._last_mesh_fallback * (1.0 - self._mesh_fallback_alpha)
                + raw * self._mesh_fallback_alpha
            )
        return float(self._last_mesh_fallback[0]), float(self._last_mesh_fallback[1])

    def find_landmarks(self, frame):
        timestamp_ms = int(time.time() * 1000)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        results = self.detector.detect_for_video(mp_image, timestamp_ms)

        if results and results.face_landmarks:
            smoothed = self._apply_smoothing(results.face_landmarks[0])
            results.face_landmarks[0] = smoothed

        return results

    def draw_on_frame(self, frame, results):
        h, w, _ = frame.shape
        self._maybe_advance_calibration()
        self._draw_calibration_overlay(frame)
        if not results or not results.face_landmarks:
            self._last_face_hud = None
            self._last_attention_ts = time.monotonic()
            self.last_status = "NO FACE"
            self.last_gaze_coord = None
            return frame

        # We process the face data here
        for face_landmarks in results.face_landmarks:

            # --- 1. DRAW MESH ---
            for idx, pt in enumerate(face_landmarks):
                if not self.DRAW_FULL_MESH and idx not in self.key_indices:
                    continue
                pos = (int(pt.x * w), int(pt.y * h))
                if idx in self.key_indices:
                    cv2.circle(frame, pos, 4, self._MESH_KEY, -1, cv2.LINE_AA)
                    cv2.circle(frame, pos, 6, self._MESH_KEY_RING, 1, cv2.LINE_AA)
                else:
                    cv2.circle(frame, pos, 1, self._MESH_DIM, -1, cv2.LINE_AA)

            self._draw_face_bounds(frame, face_landmarks, w, h)

            # --- 2. ORIGINAL ANALYSIS DATA ---
            nose_tip = face_landmarks[4]
            nose_bridge = face_landmarks[168]
            chin = face_landmarks[152]
            # --- 3. ORIGINAL NOSE POINTER ---
            p_tip = (int(nose_tip.x * w), int(nose_tip.y * h))
            p_bridge = (int(nose_bridge.x * w), int(nose_bridge.y * h))
            end_x = p_tip[0] + (p_tip[0] - p_bridge[0]) * self.POINTER_STRENGTH
            end_y = p_tip[1] + (p_tip[1] - p_bridge[1]) * self.POINTER_STRENGTH
            cv2.line(frame, p_bridge, (end_x, end_y), self._HUD_ACCENT, 2, cv2.LINE_AA)
            cv2.circle(frame, p_tip, 5, (96, 96, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, p_tip, 6, self._HUD_TEXT, 1, cv2.LINE_AA)

            # --- 4/5. SHARED METRICS (single source of truth) ---
            metrics = self.extract_face_metrics(face_landmarks, w, h)
            pitch = metrics["pitch"]
            yaw = metrics["yaw"]
            roll = metrics["roll"]
            slump_val = metrics["s_factor"]
            norm_s = metrics["norm_s"]

            self._capture_calibration_sample(pitch, yaw, norm_s)
            effective_pitch = pitch - self.offset_pitch
            effective_yaw = (yaw - self.offset_yaw) * self.YAW_SIGN
            effective_s = norm_s - self.offset_s

            now = time.monotonic()
            relative_yaw = effective_yaw
            relative_pitch = effective_pitch

            gaze_state = self._last_gaze_state or self.gaze.metrics()
            # Debounce blink to avoid single-frame blink flips
            raw_blink = gaze_state.get("is_blinking") is True
            if raw_blink:
                self._blink_frames += 1
            else:
                self._blink_frames = 0
            eyes_closed = self._blink_frames >= self._blink_frames_threshold

            # Use horizontal_ratio when available and apply wider deadzone to avoid false positives
            hratio = gaze_state.get("horizontal_ratio")
            if hratio is not None:
                gaze_extreme = (hratio <= 0.20) or (hratio >= 0.80)
            else:
                gaze_extreme = (
                    gaze_state.get("is_left") is True or gaze_state.get("is_right") is True
                )
            pupils_located = gaze_state.get("pupils_located") is True

            # If GazeTracking failed to locate pupils, try a MediaPipe-based fallback
            if not pupils_located and self.USE_MESH_FALLBACK and face_landmarks is not None:
                hratio, vratio, ok = self._estimate_pupil_ratios_from_mesh(face_landmarks, frame)
                if ok:
                    hratio, vratio = self._smooth_mesh_ratios(hratio, vratio)
                    if hratio is not None and vratio is not None:
                        pupils_located = True
                        # update gaze_state and last_gaze_state so downstream logic can use these
                        gaze_state["pupils_located"] = True
                        gaze_state["horizontal_ratio"] = hratio
                        gaze_state["vertical_ratio"] = vratio
                        # Also set convenience boolean values
                        gaze_state["is_left"] = hratio >= 0.65
                        gaze_state["is_right"] = hratio <= 0.35
                        gaze_state["source"] = "MeshFallback"
                        self._last_gaze_state = gaze_state
                else:
                    self._last_mesh_fallback = None
            ear = 0.0 if eyes_closed else 1.0

            # Focus no longer uses pitch compensation; this remains HUD posture context only.
            compensation_pitch_up = False
            head_forward = abs(effective_yaw) <= self.HARD_SAFETY_YAW_LIMIT
            eyes_open_enough = not eyes_closed

            # Fallback focus is a single ordered decision from head yaw + eye drift.
            decision = self._classify_fallback_focus(
                effective_yaw=effective_yaw,
                gaze_state=gaze_state,
            )
            status = decision["status"]
            reason = decision["reason"]
            gaze_extreme = decision["gaze_extreme"]

            # --- Combined 3D gaze vector (head + eye offset) ---
            head_vec = (
                metrics.get("head_vector")
                if metrics.get("head_vector") is not None
                else np.array([0.0, 0.0, 1.0])
            )
            head_vec = np.array(head_vec, dtype=float)
            head_vec[0] *= self.YAW_SIGN
            horizontal_ratio = gaze_state.get("horizontal_ratio")
            vertical_ratio = gaze_state.get("vertical_ratio")
            if horizontal_ratio is not None and vertical_ratio is not None:
                gaze_x = (0.5 - float(horizontal_ratio)) * 2.0 * self.YAW_SIGN
                gaze_y = (0.5 - float(vertical_ratio)) * 2.0
                eye_offset = np.array([
                    gaze_x,
                    gaze_y,
                    0.0,
                ]) * self.EYE_OFFSET_SCALE
            else:
                eye_offset = np.array([0.0, 0.0, 0.0])

            final_gaze_vec = head_vec + eye_offset
            projected = self._project_to_plane_2d(final_gaze_vec)
            self._last_normalized_screen_coord = tuple(projected)  # Store for display

            # If dynamic mapping is enabled, capture calibration samples or evaluate against screen quad
            if self.tracking_mode == "DYNAMIC_MAPPING":
                # If we are sampling corner calibration, feed projected samples
                if self._calibration_state == "corner_sampling":
                    # push candidate (x, y, dummy) to capture method
                    self._capture_calibration_sample(
                        float(projected[0]), float(projected[1]), 0.0
                    )

                if self._screen_quad_ready():
                    # Update combined normalized 2D with velocity filtering
                    stable_proj = self._update_combined_vector_with_velocity(projected, now)

                    inside, dist_to_poly = self._point_in_screen_quad(stable_proj)

                    # Lazy Head Rule: head points away but eyes/combined gaze are inside -> keep FOCUSED
                    if (not head_forward) and inside and eyes_open_enough:
                        status = "FOCUSED"
                        reason = "Lazy head: eyes on screen"
                        gaze_extreme = False

                    # Look-Ahead Rule: head points at edge but eyes look past it -> distracted
                    # If combined gaze is outside but very near the edge, assume looking away
                    EDGE_NEAR_THRESH = 0.08
                    if head_forward and (not inside):
                        if abs(dist_to_poly) < EDGE_NEAR_THRESH:
                            status = "LOOKING AWAY"
                            reason = "Look-ahead: eyes past screen edge"
                            gaze_extreme = True

            is_looking_forward = status == "FOCUSED"
            is_posture_good = abs(relative_yaw) <= self.YAW_THRESHOLD and (
                relative_pitch <= self.PITCH_THRESHOLD or compensation_pitch_up
            )
            is_focused = status == "FOCUSED"
            is_distracted = status in (
                "LOOKING AWAY",
                "LOOKING LEFT",
                "LOOKING RIGHT",
                "SLOUCHING",
                "EYES CLOSED",
                "GAZE AWAY",
            )
            self._update_attention_tracking(is_distracted)

            self._last_face_hud = {
                "norm_s": norm_s,
                "pitch": pitch,
                "is_focused": is_focused,
                "ear": ear,
            }

            if self.show_analysis_panel:
                self._draw_analysis_panel(
                    frame,
                    w,
                    nose_tip,
                    chin,
                    slump_val,
                    effective_s,
                    effective_pitch,
                    effective_yaw,
                    roll,
                    status,
                    is_looking_forward,
                    is_posture_good,
                    ear,
                    eyes_closed,
                    gaze_extreme,
                    pupils_located,
                )
            self._draw_status_banner(frame, status, is_focused, reason, w)
            self._draw_distraction_alert(frame)

            # Store these on self for telemetry/analytics access
            self.last_pitch = float(effective_pitch)
            self.last_yaw = float(effective_yaw)
            self.last_roll = float(roll)
            self.last_norm_s = float(effective_s)
            self.last_status = status
            self.last_gaze_coord = self._last_normalized_screen_coord

        return frame
