import time

import cv2
import numpy as np


class CalibrationMixin:
    def start_calibration(self):
        # Start external gaze calibration alongside local calibration when available
        try:
            gaze = getattr(self, "gaze", None)
            if gaze is not None and getattr(gaze, "available", False):
                try:
                    gaze.start_calibration()
                except Exception:
                    pass
        except Exception:
            pass

        # Start calibration according to selected tracking mode (local calibration still runs)
        if self.tracking_mode == "DYNAMIC_MAPPING":
            self._calibration_state = "corner_countdown"
            self._dynamic_corner_idx = 0
            self.dynamic_corners = []
            self._calibration_started_at = time.monotonic()
            self._calibration_samples = []
        else:
            self._calibration_state = "countdown"
            self._calibration_started_at = time.monotonic()
            self._calibration_samples = []

    def _draw_calibration_overlay(self, frame):
        h, w = frame.shape[:2]
        font = cv2.FONT_HERSHEY_DUPLEX
        if self._calibration_state == "idle":
            if time.monotonic() < self._calibration_done_until:
                text = "CALIBRATION COMPLETE"
                scale = 0.95
                thick = 2
                (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
                x = max(10, (w - tw) // 2)
                y = max(th + 10, (h // 2))
                cv2.putText(
                    frame,
                    text,
                    (x + 2, y + 2),
                    font,
                    scale,
                    (0, 0, 0),
                    thick + 1,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    frame,
                    text,
                    (x, y),
                    font,
                    scale,
                    (120, 255, 180),
                    thick,
                    cv2.LINE_AA,
                )
            return
        if self._calibration_state == "countdown":
            elapsed = time.monotonic() - self._calibration_started_at
            remaining = self.CALIBRATION_COUNTDOWN_SECONDS - int(elapsed)
            remaining = max(1, min(self.CALIBRATION_COUNTDOWN_SECONDS, remaining))
            text = f"STAY STILL: {remaining}"
            scale = 1.6
            thick = 3
            (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
            x = max(10, (w - tw) // 2)
            y = max(th + 10, (h // 2))
            cv2.putText(
                frame,
                text,
                (x + 3, y + 3),
                font,
                scale,
                (0, 0, 0),
                thick + 2,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame, text, (x, y), font, scale, (80, 220, 255), thick, cv2.LINE_AA
            )
            # also show external calibration progress if present
            gaze = getattr(self, "gaze", None)
            if gaze is not None and hasattr(gaze, "calibration_progress"):
                try:
                    progress = gaze.calibration_progress()
                    pct = int(progress * 100)
                    cv2.putText(frame, f"Gaze cal: {pct}%", (x, y + 40), font, 0.7, (180, 255, 200), 2, cv2.LINE_AA)
                except Exception:
                    pass
            return

        if self._calibration_state == "external":
            # Show external adapter calibration progress if available
            gaze = getattr(self, "gaze", None)
            progress = 1.0
            if gaze is not None and hasattr(gaze, "calibration_progress"):
                try:
                    progress = gaze.calibration_progress()
                except Exception:
                    progress = 1.0
            pct = int(progress * 100)
            text = f"External calibration: {pct}%"
            scale = 0.95
            thick = 2
            (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
            x = max(10, (w - tw) // 2)
            y = max(th + 10, (h // 2))
            cv2.putText(
                frame,
                text,
                (x + 2, y + 2),
                font,
                scale,
                (0, 0, 0),
                thick + 1,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame, text, (x, y), font, scale, (120, 255, 180), thick, cv2.LINE_AA
            )
            return

        # Dynamic mapping overlays
        if self.tracking_mode == "DYNAMIC_MAPPING":
            if self._calibration_state == "corner_countdown":
                elapsed = time.monotonic() - self._calibration_started_at
                remaining = self.CALIBRATION_COUNTDOWN_SECONDS - int(elapsed)
                remaining = max(1, min(self.CALIBRATION_COUNTDOWN_SECONDS, remaining))
                text = f"Look at CORNER {self._dynamic_corner_idx + 1}: {remaining}"
                scale = 1.2
                thick = 3
                (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
                x = max(10, (w - tw) // 2)
                y = max(th + 10, (h // 2))
                cv2.putText(
                    frame,
                    text,
                    (x + 3, y + 3),
                    font,
                    scale,
                    (0, 0, 0),
                    thick + 2,
                    cv2.LINE_AA,
                )
                cv2.putText(frame, text, (x, y), font, scale, (80, 220, 255), thick, cv2.LINE_AA)
                return
            if self._calibration_state == "corner_sampling":
                sample_count = len(self._calibration_samples)
                text = f"Corner {self._dynamic_corner_idx + 1} sampling {sample_count}/{self.CALIBRATION_SAMPLES}"
                scale = 0.95
                thick = 2
                (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
                x = max(10, (w - tw) // 2)
                y = max(th + 10, (h // 2))
                cv2.putText(
                    frame,
                    text,
                    (x + 2, y + 2),
                    font,
                    scale,
                    (0, 0, 0),
                    thick + 1,
                    cv2.LINE_AA,
                )
                cv2.putText(frame, text, (x, y), font, scale, (120, 255, 180), thick, cv2.LINE_AA)
                # also render external gaze calibration progress if present
                gaze = getattr(self, "gaze", None)
                if gaze is not None and hasattr(gaze, "calibration_progress"):
                    try:
                        progress = gaze.calibration_progress()
                        pct = int(progress * 100)
                        cv2.putText(frame, f"Gaze cal: {pct}%", (x, y + 30), font, 0.7, (180, 255, 200), 2, cv2.LINE_AA)
                    except Exception:
                        pass
                return

        if self._calibration_state == "sampling":
            sample_count = len(self._calibration_samples)
            text = f"CALIBRATING... {sample_count}/{self.CALIBRATION_SAMPLES}"
            scale = 0.95
            thick = 2
            (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
            x = max(10, (w - tw) // 2)
            y = max(th + 10, (h // 2))
            cv2.putText(
                frame,
                text,
                (x + 2, y + 2),
                font,
                scale,
                (0, 0, 0),
                thick + 1,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame, text, (x, y), font, scale, (120, 255, 180), thick, cv2.LINE_AA
            )
            # also show external gaze calibration progress
            gaze = getattr(self, "gaze", None)
            if gaze is not None and hasattr(gaze, "calibration_progress"):
                try:
                    progress = gaze.calibration_progress()
                    pct = int(progress * 100)
                    cv2.putText(frame, f"Gaze cal: {pct}%", (x, y + 30), font, 0.7, (180, 255, 200), 2, cv2.LINE_AA)
                except Exception:
                    pass

    def _maybe_advance_calibration(self):
        # Fallback mode countdown -> sampling
        if self.tracking_mode != "DYNAMIC_MAPPING":
            if self._calibration_state != "countdown":
                return
            elapsed = time.monotonic() - self._calibration_started_at
            if elapsed >= self.CALIBRATION_COUNTDOWN_SECONDS:
                self._calibration_state = "sampling"
                self._calibration_samples = []
            return

        # Dynamic mapping: corner countdown -> corner sampling
        if self.tracking_mode == "DYNAMIC_MAPPING":
            if self._calibration_state == "corner_countdown":
                elapsed = time.monotonic() - self._calibration_started_at
                if elapsed >= self.CALIBRATION_COUNTDOWN_SECONDS:
                    self._calibration_state = "corner_sampling"
                    self._calibration_samples = []
            return

    def _capture_calibration_sample(self, pitch, yaw, norm_s):
        # Fallback sampling
        if self.tracking_mode != "DYNAMIC_MAPPING":
            if self._calibration_state != "sampling":
                return
            self._calibration_samples.append((pitch, yaw, norm_s))
            if len(self._calibration_samples) >= self.CALIBRATION_SAMPLES:
                samples = np.array(self._calibration_samples, dtype=float)
                self.offset_pitch = float(np.mean(samples[:, 0]))
                self.offset_yaw = float(np.mean(samples[:, 1]))
                self.offset_s = float(np.mean(samples[:, 2]))
                self._calibration_state = "idle"
                self._calibration_samples = []
                self._calibration_done_until = time.monotonic() + 0.8
            return

        # Dynamic mapping sampling: capture combined gaze samples for current corner
        if self.tracking_mode == "DYNAMIC_MAPPING":
            if self._calibration_state != "corner_sampling":
                return
            # In dynamic mode, the caller will append a combined vector tuple to samples
            # Here we expect pitch param to be a combined 2D projected point tuple when called.
            self._calibration_samples.append((pitch, yaw, norm_s))
            if len(self._calibration_samples) >= self.CALIBRATION_SAMPLES:
                arr = np.array(self._calibration_samples, dtype=float)
                avg = np.mean(arr, axis=0)
                # store the averaged projected 2D point for the corner
                self.dynamic_corners.append((float(avg[0]), float(avg[1])))
                self._calibration_samples = []
                self._dynamic_corner_idx += 1
                if self._dynamic_corner_idx >= self.DYNAMIC_CALIB_CORNERS:
                    self._calibration_state = "idle"
                    self._calibration_done_until = time.monotonic() + 0.8
                else:
                    # prepare next corner
                    self._calibration_state = "corner_countdown"
                    self._calibration_started_at = time.monotonic()
