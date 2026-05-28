import time

import cv2
import numpy as np


class HudRendererMixin:
    @staticmethod
    def _rounded_rect_filled(img, x1, y1, x2, y2, color, radius=12):
        r = max(0, min(radius, (x2 - x1) // 2, (y2 - y1) // 2))
        if r <= 0:
            cv2.rectangle(img, (x1, y1), (x2, y2), color, -1)
            return
        cv2.rectangle(img, (x1 + r, y1), (x2 - r, y2), color, -1)
        cv2.rectangle(img, (x1, y1 + r), (x2, y2 - r), color, -1)
        cv2.ellipse(img, (x1 + r, y1 + r), (r, r), 180, 0, 90, color, -1)
        cv2.ellipse(img, (x2 - r, y1 + r), (r, r), 270, 0, 90, color, -1)
        cv2.ellipse(img, (x1 + r, y2 - r), (r, r), 90, 0, 90, color, -1)
        cv2.ellipse(img, (x2 - r, y2 - r), (r, r), 0, 0, 90, color, -1)

    @staticmethod
    def _put_text_shadow(
        img, text, org, font, scale, color, thickness, shadow_delta=(2, 2)
    ):
        ox, oy = org
        dx, dy = shadow_delta
        cv2.putText(
            img,
            text,
            (ox + dx, oy + dy),
            font,
            scale,
            (0, 0, 0),
            thickness + 1,
            cv2.LINE_AA,
        )
        cv2.putText(img, text, org, font, scale, color, thickness, cv2.LINE_AA)

    def _draw_focus_bar(self, frame, norm_s, x, y, bar_w, bar_h, threshold):
        """Horizontal bar: posture signal vs focus threshold."""
        cv2.rectangle(
            frame, (x, y), (x + bar_w, y + bar_h), (60, 60, 68), -1, cv2.LINE_AA
        )
        fill_w = int(np.clip(norm_s, 0.0, 1.0) * bar_w)
        bar_color = self._HUD_GOOD if norm_s >= threshold else self._HUD_BAD
        if fill_w > 0:
            cv2.rectangle(
                frame, (x, y), (x + fill_w, y + bar_h), bar_color, -1, cv2.LINE_AA
            )
        thr_x = x + int(threshold * bar_w)
        cv2.line(
            frame,
            (thr_x, y - 2),
            (thr_x, y + bar_h + 2),
            self._HUD_ACCENT,
            2,
            cv2.LINE_AA,
        )

    def _draw_analysis_panel(
        self,
        frame,
        w,
        nose_tip,
        chin,
        slump_val,
        norm_s,
        pitch,
        yaw,
        roll,
        status,
        is_looking_forward,
        is_posture_good,
        ear,
        eyes_closed,
        gaze_extreme,
        iris_ok,
    ):
        panel_w, margin, radius = 198, 8, 10
        x1, y1 = w - panel_w - margin, margin
        x2, y2 = w - margin, y1 + 330

        overlay = frame.copy()
        self._rounded_rect_filled(overlay, x1, y1, x2, y2, self._HUD_BG, radius)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        cv2.rectangle(frame, (x1, y1), (x2, y2), self._HUD_BORDER, 1, cv2.LINE_AA)

        font = cv2.FONT_HERSHEY_SIMPLEX
        pad = x1 + 8
        y = y1 + 18
        self._put_text_shadow(
            frame, "SMART FOCUS", (pad, y), font, 0.38, self._HUD_ACCENT, 1
        )
        self._put_text_shadow(
            frame, "[P] hide", (x2 - 78, y), font, 0.28, self._HUD_MUTED, 1
        )
        y += 18
        self._put_text_shadow(
            frame, "Live analysis", (pad, y), font, 0.3, self._HUD_MUTED, 1
        )
        y += 20

        sc, th = 0.3, 1

        def row_pair(a, b, cb=None):
            nonlocal y
            self._put_text_shadow(frame, a, (pad, y), font, sc, self._HUD_MUTED, th)
            self._put_text_shadow(
                frame, b, (pad + 72, y), font, sc, cb or self._HUD_TEXT, th
            )
            y += 16

        row_pair("Nose Y", f"{nose_tip.y:.4f}", self._HUD_GOOD)
        row_pair("Chin Y", f"{chin.y:.4f}", self._HUD_GOOD)
        row_pair("S-Factor", f"{slump_val:.3f}", self._HUD_WARN)
        row_pair("Norm S", f"{norm_s:.3f}", self._HUD_WARN)
        row_pair("EAR", f"{ear:.3f}", self._HUD_WARN)
        gaze_txt = "n/a"
        if iris_ok:
            gaze_txt = "OK" if not gaze_extreme else "EXT"
        row_pair(
            "Gaze",
            gaze_txt,
            self._HUD_GOOD if iris_ok and not gaze_extreme else self._HUD_BAD,
        )
        row_pair(
            "Eyes",
            "SHUT" if eyes_closed else "OPEN",
            self._HUD_WARN if eyes_closed else self._HUD_GOOD,
        )
        y += 2
        self._put_text_shadow(
            frame, "3D pose", (pad, y), font, 0.28, self._HUD_MUTED, th
        )
        y += 16
        pose_line = f"P {pitch:+.1f}  Y {yaw:+.1f}  R {roll:+.1f}"
        self._put_text_shadow(frame, pose_line, (pad, y), font, sc, (200, 210, 255), th)
        y += 18

        bar_w = x2 - pad - 10
        self._put_text_shadow(
            frame,
            "Posture vs target (| = goal)",
            (pad, y),
            font,
            0.26,
            self._HUD_MUTED,
            th,
        )
        y += 14
        self._draw_focus_bar(frame, norm_s, pad, y, bar_w, 9, self.FOCUS_THRESHOLD)
        y += 16
        eye_ok = "Fwd" if is_looking_forward else "Away"
        pose_ok = "Up" if is_posture_good else "Slouch"

        y += 14
        self._put_text_shadow(
            frame,
            f"Head: {eye_ok}   Pose: {pose_ok}",
            (pad, y),
            font,
            0.28,
            self._HUD_MUTED,
            th,
        )
        y += 18
        self._put_text_shadow(
            frame, "Focus timer", (pad, y), font, 0.28, self._HUD_MUTED, th
        )
        y += 14
        focus_pct = self._focus_percentage()
        row_pair(
            "Focused", self._format_duration(self.total_focus_time), self._HUD_GOOD
        )
        row_pair(
            "Distract", self._format_duration(self.total_distracted_time), self._HUD_BAD
        )
        row_pair("Focus %", f"{focus_pct:5.1f}%", self._HUD_ACCENT)

    def _draw_collapsed_hud_chip(self, frame, w, h):
        chip_w, chip_h, m = 142, 48, 8
        x2, y2 = w - m, m + chip_h
        x1, y1 = x2 - chip_w, m
        overlay = frame.copy()
        self._rounded_rect_filled(overlay, x1, y1, x2, y2, self._HUD_BG, 10)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
        cv2.rectangle(frame, (x1, y1), (x2, y2), self._HUD_BORDER, 1, cv2.LINE_AA)
        font = cv2.FONT_HERSHEY_SIMPLEX
        self._put_text_shadow(
            frame, "Analysis hidden", (x1 + 8, y1 + 18), font, 0.32, self._HUD_ACCENT, 1
        )
        line2 = "[P] expand panel"
        if self._last_face_hud:
            s = self._last_face_hud
            dot = self._HUD_GOOD if s["is_focused"] else self._HUD_BAD
            cv2.circle(frame, (x2 - 14, y1 + 30), 4, dot, -1, cv2.LINE_AA)
            line2 = f"nS {s['norm_s']:.2f}  P{s['pitch']:+.0f}  [P]"
        self._put_text_shadow(
            frame, line2, (x1 + 8, y1 + 36), font, 0.28, self._HUD_MUTED, 1
        )

    def _status_visuals(self, status):
        if status == "FOCUSED":
            return self._HUD_GOOD, self._HUD_GOOD
        if status == "SLOUCHING":
            return self._HUD_WARN, self._HUD_WARN
        if status == "LOOKING AWAY":
            return self._HUD_BAD, self._HUD_BAD
        if status in (
            "LOOKING LEFT",
            "LOOKING RIGHT",
            "LOOKING UP",
            "LOOKING DOWN",
            "LOOKING DOWN/SLOUCHING",
            "GAZE AWAY",
        ):
            return self._HUD_BAD, self._HUD_BAD
        if status == "EYES CLOSED":
            return self._HUD_WARN, self._HUD_WARN
        return self._HUD_TEXT, self._HUD_INFO

    def _draw_status_banner(self, frame, status, is_focused, reason, w):
        font = cv2.FONT_HERSHEY_SIMPLEX
        bx1, by1, bx2, by2 = 10, 10, 340, 108
        overlay = frame.copy()
        self._rounded_rect_filled(overlay, bx1, by1, bx2, by2, (32, 36, 42), 14)
        cv2.addWeighted(overlay, 0.62, frame, 0.38, 0, frame)
        status_color, border_color = self._status_visuals(status)
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), border_color, 1, cv2.LINE_AA)

        max_status_w = bx2 - bx1 - 28
        status_scale = 0.9
        status_thickness = 2
        while status_scale > 0.45:
            (status_w, _), _ = cv2.getTextSize(
                status, font, status_scale, status_thickness
            )
            if status_w <= max_status_w:
                break
            status_scale -= 0.05
            if status_scale < 0.65:
                status_thickness = 1
        self._put_text_shadow(
            frame, status, (24, 48), font, status_scale, status_color, status_thickness
        )
        sub = reason if not is_focused else "Posture + gaze on task"
        self._put_text_shadow(frame, sub, (24, 80), font, 0.48, self._HUD_MUTED, 1)
        self._put_text_shadow(
            frame,
            "C calibrate Q quit",
            (w - 180, 376),
            font,
            0.38,
            self._HUD_MUTED,
            1,
        )

    def _draw_distraction_alert(self, frame):
        if not self._alert_active:
            return
        phase = int(time.monotonic() / self.ALERT_FLASH_PERIOD_SECONDS) % 2
        if phase == 0:
            return
        h, w = frame.shape[:2]
        cv2.rectangle(frame, (4, 4), (w - 5, h - 5), (0, 0, 255), 6, cv2.LINE_AA)
        cv2.rectangle(frame, (11, 11), (w - 12, h - 12), (0, 40, 180), 2, cv2.LINE_AA)

    def _draw_face_bounds(self, frame, face_landmarks, w, h, pad=10):
        xs = [pt.x * w for pt in face_landmarks]
        ys = [pt.y * h for pt in face_landmarks]
        xmin, xmax = int(min(xs)), int(max(xs))
        ymin, ymax = int(min(ys)), int(max(ys))
        x0, y0 = max(0, xmin - pad), max(0, ymin - pad)
        x1, y1 = min(w - 1, xmax + pad), min(h - 1, ymax + pad)
        overlay = frame.copy()
        cv2.rectangle(overlay, (x0, y0), (x1, y1), self._HUD_BORDER, 1)
        cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)

    def draw_frame_chrome(self, frame):
        """Reserved for frame-level chrome outside the always-visible status banner."""
        return

