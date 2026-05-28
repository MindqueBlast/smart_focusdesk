import math

import cv2
import numpy as np


class DetectorMathMixin:
    @staticmethod
    def _finite_array(values, expected_len=None):
        try:
            arr = np.array(values, dtype=float).reshape(-1)
        except (TypeError, ValueError):
            return None
        if expected_len is not None and arr.size != expected_len:
            return None
        if not np.all(np.isfinite(arr)):
            return None
        return arr

    def _apply_smoothing(self, current_landmarks):
        if self.previous_landmarks is None:
            self.previous_landmarks = current_landmarks
            return current_landmarks

        # Velocity-sensitive alpha from nose-tip movement:
        # small motion -> stronger stabilization, large motion -> fast tracking.
        curr_nose = current_landmarks[4]
        prev_nose = self.previous_landmarks[4]
        motion = math.sqrt(
            (curr_nose.x - prev_nose.x) ** 2
            + (curr_nose.y - prev_nose.y) ** 2
            + (curr_nose.z - prev_nose.z) ** 2
        )

        if motion <= self.JITTER_MOTION_THRESHOLD:
            dynamic_alpha = self.LOW_ALPHA
        elif motion >= self.FAST_MOTION_THRESHOLD:
            dynamic_alpha = self.HIGH_ALPHA
        else:
            blend = (motion - self.JITTER_MOTION_THRESHOLD) / (
                self.FAST_MOTION_THRESHOLD - self.JITTER_MOTION_THRESHOLD
            )
            dynamic_alpha = self.LOW_ALPHA + blend * (self.HIGH_ALPHA - self.LOW_ALPHA)

        smoothed_list = []
        for curr, prev in zip(current_landmarks, self.previous_landmarks):
            curr.x = (dynamic_alpha * curr.x) + ((1 - dynamic_alpha) * prev.x)
            curr.y = (dynamic_alpha * curr.y) + ((1 - dynamic_alpha) * prev.y)
            curr.z = (dynamic_alpha * curr.z) + ((1 - dynamic_alpha) * prev.z)
            smoothed_list.append(curr)

        self.previous_landmarks = smoothed_list
        return smoothed_list

    def extract_face_metrics(self, face_landmarks, w, h):
        """
        Single source of truth for face metrics used by both UI and batch calibration.
        Returns pitch/yaw/roll plus s_factor/norm_s.
        """
        nose_tip = face_landmarks[4]
        chin = face_landmarks[152]
        forehead = face_landmarks[10]

        slump_val = abs(nose_tip.y - chin.y)
        face_height = abs(forehead.y - chin.y)
        norm_s = slump_val / face_height if face_height != 0 else 0.0

        pitch, yaw, roll = 0.0, 0.0, 0.0
        head_vector = np.array([0.0, 0.0, 1.0], dtype=float)

        image_points = np.array(
            [
                (face_landmarks[i].x * w, face_landmarks[i].y * h)
                for i in self.pnp_indices
            ],
            dtype="double",
        )

        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array(
            [[focal_length, 0, center[0]], [0, focal_length, center[1]], [0, 0, 1]],
            dtype="double",
        )

        success, r_vec, t_vec = cv2.solvePnP(
            self.model_points,
            image_points,
            camera_matrix,
            np.zeros((4, 1)),
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if success:
            rmat, _ = cv2.Rodrigues(r_vec)
            proj_mat = np.hstack((rmat, t_vec))
            angles = cv2.decomposeProjectionMatrix(proj_mat)[6].flatten()
            p, y, r = angles

            pitch = (p - 180) if p > 0 else (p + 180)
            yaw, roll = float(y), float(r)

            # head forward vector in camera coords is the 3rd column of rmat
            try:
                head_vector = np.array(rmat[:, 2].flatten(), dtype=float)
            except Exception:
                head_vector = np.array([0.0, 0.0, 1.0], dtype=float)

        return {
            "pitch": float(pitch),
            "yaw": float(yaw),
            "roll": float(roll),
            "s_factor": float(slump_val),
            "norm_s": float(norm_s),
            "head_vector": head_vector,
        }

    def _project_to_plane_2d(self, vec3):
        vec = self._finite_array(vec3, expected_len=3)
        if vec is None:
            return np.array([0.0, 0.0], dtype=float)

        vz = float(vec[2])
        if abs(vz) < 1e-6:
            return np.array([0.0, 0.0], dtype=float)
        return np.array([float(vec[0]) / vz, float(vec[1]) / vz], dtype=float)

    def _screen_quad_ready(self):
        if len(self.dynamic_corners) != self.DYNAMIC_CALIB_CORNERS:
            return False
        poly = self._finite_array(self.dynamic_corners)
        if poly is None or poly.size != self.DYNAMIC_CALIB_CORNERS * 2:
            return False
        poly = poly.reshape(self.DYNAMIC_CALIB_CORNERS, 2).astype(np.float32)
        return cv2.contourArea(poly) > 1e-6

    def _point_in_screen_quad(self, pt2d):
        if not self._screen_quad_ready():
            return False, float("inf")
        pt = self._finite_array(pt2d, expected_len=2)
        if pt is None:
            return False, float("inf")
        poly = np.array(self.dynamic_corners, dtype=np.float32)
        dist = cv2.pointPolygonTest(poly, (float(pt[0]), float(pt[1])), True)
        inside = dist >= 0.0
        return inside, float(dist)

    def _update_combined_vector_with_velocity(self, candidate2d, now):
        candidate = self._finite_array(candidate2d, expected_len=2)
        if candidate is None:
            if self._combined_vec_stable is None:
                self._combined_vec_stable = np.array([0.0, 0.0], dtype=float)
            return self._combined_vec_stable

        if self._combined_vec_stable is None:
            self._combined_vec_stable = candidate
            self._last_combined_ts = now
            return self._combined_vec_stable

        dt = max(1e-6, now - self._last_combined_ts)
        vel = np.linalg.norm(candidate - self._combined_vec_stable) / dt
        if now < self._ignore_until:
            return self._combined_vec_stable

        if vel > self.VELOCITY_THRESHOLD:
            if self._ignore_until > 0.0 and now >= self._ignore_until:
                self._combined_vec_stable = candidate
                self._last_combined_ts = now
                self._ignore_until = 0.0
                return self._combined_vec_stable
            self._ignore_until = now + self.VELOCITY_IGNORE_SECONDS
            return self._combined_vec_stable

        a = self.VECTOR_EMA_ALPHA
        self._combined_vec_stable = (
            a * candidate + (1.0 - a) * self._combined_vec_stable
        )
        self._last_combined_ts = now
        self._ignore_until = 0.0
        return self._combined_vec_stable

    @classmethod
    def _classify_fallback_focus(
        cls,
        effective_yaw,
        gaze_state=None,
    ):
        """
        Classify focus from head yaw first, then GazeTracking eye status.
        """
        try:
            effective_yaw = float(effective_yaw)
        except (TypeError, ValueError):
            effective_yaw = 0.0
        if not math.isfinite(effective_yaw):
            effective_yaw = 0.0

        if abs(effective_yaw) > cls.HARD_SAFETY_YAW_LIMIT:
            return {
                "status": "LOOKING RIGHT" if effective_yaw > 0 else "LOOKING LEFT",
                "reason": "Hard safety yaw exceeded",
                "gaze_extreme": False,
                "screen_gaze_x": None,
            }

        gaze_state = gaze_state or {}
        is_blinking = gaze_state.get("is_blinking") is True
        # Prefer calibrated horizontal_ratio when available; require stronger deviation to trigger
        hratio = gaze_state.get("horizontal_ratio")
        if hratio is not None:
            is_left = hratio >= 0.80
            is_right = hratio <= 0.20
        else:
            is_left = gaze_state.get("is_left") is True
            is_right = gaze_state.get("is_right") is True

        if is_blinking:
            return {
                "status": "EYES CLOSED",
                "reason": "GazeTracking blink detected",
                "gaze_extreme": False,
                "screen_gaze_x": None,
            }

        if is_left or is_right:
            return {
                "status": "GAZE AWAY",
                "reason": "GazeTracking eye gaze off center",
                "gaze_extreme": True,
                "screen_gaze_x": None,
            }

        return {
            "status": "FOCUSED",
            "reason": "Head within limits; GazeTracking centered",
            "gaze_extreme": False,
            "screen_gaze_x": None,
        }
