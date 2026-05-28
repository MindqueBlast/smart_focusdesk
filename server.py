import logging
import os
import threading
import time
from typing import Any, Dict, Generator, Literal, Optional

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from modules.analytics_engine import AnalyticsEngine
from modules.detector import FaceDetector
from modules.firebase_backend import initialize_firebase
from modules.led_controller import set_led_backend, stop_controller
import atexit
from modules.led_controller import stop_controller

atexit.register(stop_controller)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
TRACKING_MODES = {"CALIBRATED_THRESHOLDS", "DYNAMIC_MAPPING"}
HARDWARE_BACKENDS = {"arduino", "blink1"}
MISSING_FACE_DISTRACTION_FRAMES = 18
PHONE_DOWN_PITCH_THRESHOLD = 16
PHONE_DOWN_GAZE_Y_THRESHOLD = 0.65
# Consecutive distracted frames required before triggering hardware/UI alerts (~2-3 seconds)
ALERT_DELAY_FRAMES = 60

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger("smart_focusdesk.server")


class SessionConfig(BaseModel):
    uid: str = Field(..., min_length=1)
    hardware: Literal["arduino", "blink1"] = "arduino"
    tracking_mode: Literal["CALIBRATED_THRESHOLDS", "DYNAMIC_MAPPING"] = (
        "CALIBRATED_THRESHOLDS"
    )


class SessionManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._detector: Optional[FaceDetector] = None
        self._analytics: Optional[AnalyticsEngine] = None
        self._uid: Optional[str] = None
        self._hardware: Optional[str] = None
        self._tracking_mode: Optional[str] = None
        self._worker_active = False
        self._session_active = False
        self._calibration_requested = False
        self._session_started_at: Optional[float] = None
        self._last_error: Optional[str] = None
        self._last_summary: Optional[Dict[str, Any]] = None
        self._telemetry = self._inactive_telemetry()
        self._frame_condition = threading.Condition()
        self._latest_jpeg: Optional[bytes] = None

    def start_session(self, config: SessionConfig) -> Dict[str, Any]:
        config = self._validated_config(config)
        with self._lock:
            if self._session_active:
                raise HTTPException(status_code=409, detail="A focus session is already active.")

            if self._worker_active:
                self._ensure_same_runtime_config(config)
                self._start_analytics_locked(config.uid)
                return self._state_locked("started")

            self._start_worker_locked(config, calibration_requested=False)
            self._start_analytics_locked(config.uid)
            return self._state_locked("starting")

    def calibrate(self, config: SessionConfig) -> Dict[str, Any]:
        config = self._validated_config(config)
        with self._lock:
            if self._worker_active:
                self._ensure_same_runtime_config(config)
                if self._detector is None:
                    self._calibration_requested = True
                else:
                    self._detector.start_calibration()
                return self._state_locked("calibration_requested")

            self._start_worker_locked(config, calibration_requested=True)
            return self._state_locked("calibration_starting")

    def stop(self) -> Dict[str, Any]:
        thread: Optional[threading.Thread]
        analytics: Optional[AnalyticsEngine]

        with self._lock:
            thread = self._thread
            analytics = self._analytics if self._session_active else None
            self._stop_event.set()

        if thread is not None and thread.is_alive():
            thread.join(timeout=5.0)

        summary = None
        if analytics is not None and analytics.is_active:
            try:
                with self._lock:
                    summary = analytics.stop_session()
                    self._last_summary = summary
            except Exception as exc:
                LOG.exception("Failed to stop analytics session.")
                with self._lock:
                    self._last_error = str(exc)

        self._cleanup_resources()

        with self._lock:
            self._thread = None
            self._detector = None
            self._analytics = None
            self._worker_active = False
            self._session_active = False
            self._calibration_requested = False
            self._session_started_at = None
            self._uid = None
            self._hardware = None
            self._tracking_mode = None
            self._telemetry = self._inactive_telemetry(summary=summary)
            with self._frame_condition:
                self._latest_jpeg = None
                self._frame_condition.notify_all()
            return {
                "active": False,
                "worker_active": False,
                "summary": summary,
                "last_error": self._last_error,
            }

    def live_telemetry(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._telemetry)

    def video_stream(self) -> Generator[bytes, None, None]:
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        while True:
            with self._frame_condition:
                self._frame_condition.wait(timeout=1.0)
                frame = self._latest_jpeg

            if frame is None:
                frame = self._idle_frame()

            yield boundary + frame + b"\r\n"

    def _start_worker_locked(
        self, config: SessionConfig, calibration_requested: bool
    ) -> None:
        self._uid = config.uid.strip()
        self._hardware = config.hardware
        self._tracking_mode = config.tracking_mode
        self._stop_event.clear()
        self._last_error = None
        self._last_summary = None
        self._calibration_requested = calibration_requested
        self._worker_active = True
        self._session_active = False
        self._telemetry = {
            **self._inactive_telemetry(),
            "worker_active": True,
            "status": "STARTING",
            "uid": self._uid,
            "hardware": self._hardware,
            "tracking_mode": self._tracking_mode,
            "calibration": self._calibration_state(None),
        }
        self._thread = threading.Thread(target=self._run_worker, daemon=True)
        self._thread.start()

    @staticmethod
    def _validated_config(config: SessionConfig) -> SessionConfig:
        uid = config.uid.strip()
        if not uid:
            raise HTTPException(status_code=422, detail="uid must be a non-empty string.")
        return SessionConfig(
            uid=uid,
            hardware=config.hardware,
            tracking_mode=config.tracking_mode,
        )

    def _start_analytics_locked(self, uid: str) -> None:
        if self._analytics is None:
            self._analytics = AnalyticsEngine(user_id=uid)
        session_id = self._analytics.start_session(uid)
        self._session_active = True
        self._session_started_at = time.time()
        self._telemetry.update(
            {
                "active": True,
                "session_id": session_id,
                "session_started_at": self._session_started_at,
                "status": "STARTING",
            }
        )

    def _run_worker(self) -> None:
        cap: Optional[cv2.VideoCapture] = None
        prev_alert_active = False
        missing_face_frames = 0
        consecutive_distracted_frames = 0 # Track how long they've been continuously unfocused

        try:
            with self._lock:
                hardware = self._hardware or "arduino"
                tracking_mode = self._tracking_mode or "CALIBRATED_THRESHOLDS"

            set_led_backend(hardware)
            detector = FaceDetector(tracking_mode=tracking_mode)

            with self._lock:
                self._detector = detector
                if self._calibration_requested:
                    detector.start_calibration()

            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            if not cap.isOpened():
                raise RuntimeError("Could not open webcam.")

            while not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret or frame is None:
                    time.sleep(0.02)
                    continue

                try:
                    detector.YAW_SIGN = 1
                    detector.refresh_gaze(frame)
                    results = detector.find_landmarks(frame)
                    detector.draw_on_frame(frame, results)
                    
                    # 1. Capture raw state internally
                    missing_face_frames = self._refine_tracking_state(
                        detector, missing_face_frames
                    )
                    
                    # 2. Extract raw status to evaluate the grace period
                    raw_status = str(getattr(detector, "last_status", "FOCUSED") or "FOCUSED")
                    is_distracted = raw_status in ["FACE LOST", "LOOKING DOWN", "LOOKING AWAY", "LOOKING LEFT", "LOOKING RIGHT", "SLOUCHING"]
                    
                    # 3. Handle the grace period counter
                    if is_distracted:
                        consecutive_distracted_frames += 1
                    else:
                        consecutive_distracted_frames = 0

                    # 4. Filter status and alerts based on the grace period threshold
                    if consecutive_distracted_frames >= ALERT_DELAY_FRAMES:
                        detector._alert_active = True
                        # Threshold reached -> Let the UI see the distraction and go red
                        effective_status = raw_status
                    else:
                        detector._alert_active = False
                        # Still in grace period -> Keep UI green and calm
                        effective_status = "FOCUSED"

                    self._publish_video_frame(frame)
                    
                    # Pass the filtered effective_status down to telemetry recording
                    self._record_frame(detector, prev_alert_active, effective_status)
                    prev_alert_active = getattr(detector, "_alert_active", False)
                    
                except Exception as exc:
                    LOG.exception("Detector frame processing failed.")

        except Exception as exc:
            LOG.exception("Local agent worker failed.")
            with self._lock:
                self._last_error = str(exc)
                self._worker_active = False
                self._session_active = False
                self._telemetry.update(
                    {
                        "active": False,
                        "worker_active": False,
                        "status": "ERROR",
                        "last_error": str(exc),
                    }
                )
        finally:
            if cap is not None:
                cap.release()
            with self._lock:
                self._worker_active = False
                if not self._session_active:
                    self._telemetry.update(
                        {
                            "active": False,
                            "worker_active": False,
                            "updated_at": time.time(),
                        }
                    )
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

    def _publish_video_frame(self, frame: Any) -> None:
        ok, encoded = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
        )
        if not ok:
            return

        with self._frame_condition:
            self._latest_jpeg = encoded.tobytes()
            self._frame_condition.notify_all()

    def _refine_tracking_state(
        self, detector: FaceDetector, missing_face_frames: int
    ) -> int:
        status = str(getattr(detector, "last_status", "NO FACE") or "NO FACE")
        if status == "NO FACE":
            missing_face_frames += 1
            if missing_face_frames >= MISSING_FACE_DISTRACTION_FRAMES:
                detector.last_status = "FACE LOST"
            return missing_face_frames

        missing_face_frames = 0
        pitch = float(getattr(detector, "last_pitch", 0.0) or 0.0)
        gaze = getattr(detector, "last_gaze_coord", None)
        gaze_y = None
        if gaze is not None:
            try:
                gaze_y = float(gaze[1])
            except (TypeError, ValueError, IndexError):
                gaze_y = None

        phone_pitch = pitch >= PHONE_DOWN_PITCH_THRESHOLD
        phone_gaze = gaze_y is not None and gaze_y >= PHONE_DOWN_GAZE_Y_THRESHOLD
        if phone_pitch or (pitch >= PHONE_DOWN_PITCH_THRESHOLD * 0.72 and phone_gaze):
            detector.last_status = "LOOKING DOWN"
            
        return missing_face_frames

    def _record_frame(self, detector: FaceDetector, prev_alert_active: bool, effective_status: str) -> None:
        gaze = detector.last_gaze_coord
        head_angle = {
            "pitch": detector.last_pitch,
            "yaw": detector.last_yaw,
            "roll": detector.last_roll,
        }
        posture = {
            "norm_s": detector.last_norm_s,
            "slump_val": (
                getattr(detector, "_last_face_hud", {}).get("norm_s", 0.0)
                if getattr(detector, "_last_face_hud", None)
                else 0.0
            ),
        }
        alert_active = getattr(detector, "_alert_active", False)

        with self._lock:
            analytics = self._analytics if self._session_active else None
            if analytics is not None:
                # Use effective_status here so analytics logs match the true alert periods
                analytics.record_frame(gaze, head_angle, posture, effective_status)
                if alert_active and not prev_alert_active:
                    analytics.log_distraction_event(
                        "LED_DISTRACTION_ALERT_ON",
                        {
                            "reason": effective_status,
                            "yaw": detector.last_yaw,
                            "pitch": detector.last_pitch,
                        },
                    )
                elif not alert_active and prev_alert_active:
                    analytics.log_distraction_event("LED_DISTRACTION_ALERT_OFF")
                focus_score, _ = analytics.calculate_focus_score()
                distraction_count = len(analytics.distraction_events)
                session_id = analytics.session_id
                started_at = self._session_started_at
            else:
                focus_score = 0.0
                distraction_count = 0
                session_id = None
                started_at = None

            self._telemetry = {
                "active": self._session_active,
                "worker_active": self._worker_active,
                "session_id": session_id,
                "session_started_at": started_at,
                "uid": self._uid,
                "hardware": self._hardware,
                "tracking_mode": self._tracking_mode,
                "focus_score": round(float(focus_score), 2),
                "status": effective_status, # <--- THIS keeps the web UI from switching instantly!
                "distraction_count": distraction_count,
                "slouch_factor": float(detector.last_norm_s),
                "gaze": self._json_pair(gaze),
                "head_angle": head_angle,
                "calibration": self._calibration_state(detector),
                "updated_at": time.time(),
                "last_error": self._last_error,
            }

    def _ensure_same_runtime_config(self, config: SessionConfig) -> None:
        if self._uid != config.uid.strip():
            raise HTTPException(
                status_code=409,
                detail="The local agent is already running for a different user.",
            )
        if self._hardware != config.hardware or self._tracking_mode != config.tracking_mode:
            raise HTTPException(
                status_code=409,
                detail="Stop the current local agent before changing hardware or tracking mode.",
            )

    def _cleanup_resources(self) -> None:
        try:
            stop_controller()
            time.sleep(0.5) # Give the hardware 500ms to register the close
        except Exception:
            LOG.exception("Failed to stop LED controller.")
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass

    @staticmethod
    def _idle_frame() -> bytes:
        frame = np.full((360, 640, 3), (12, 17, 24), dtype=np.uint8)
        cv2.putText(
            frame,
            "Smart FocusDesk local agent idle",
            (72, 182),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (170, 188, 208),
            2,
            cv2.LINE_AA,
        )
        ok, encoded = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
        )
        return encoded.tobytes() if ok else b""

    def _state_locked(self, status: str) -> Dict[str, Any]:
        return {
            "active": self._session_active,
            "worker_active": self._worker_active,
            "session_id": self._telemetry.get("session_id"),
            "status": status,
            "hardware": self._hardware,
            "tracking_mode": self._tracking_mode,
            "calibration": self._telemetry.get("calibration"),
            "last_error": self._last_error,
        }

    @staticmethod
    def _json_pair(value: Any) -> Optional[list[float]]:
        if value is None:
            return None
        try:
            return [float(value[0]), float(value[1])]
        except Exception:
            return None

    @staticmethod
    def _calibration_state(detector: Optional[FaceDetector]) -> Dict[str, Any]:
        if detector is None:
            return {
                "state": "idle",
                "corner_index": 0,
                "sample_count": 0,
                "corner_count": 0,
                "complete": False,
            }

        state = getattr(detector, "_calibration_state", "idle")
        corner_count = len(getattr(detector, "dynamic_corners", []) or [])
        return {
            "state": state,
            "corner_index": int(getattr(detector, "_dynamic_corner_idx", 0)),
            "sample_count": len(getattr(detector, "_calibration_samples", []) or []),
            "corner_count": corner_count,
            "complete": state == "idle"
            and (
                getattr(detector, "tracking_mode", "") != "DYNAMIC_MAPPING"
                or corner_count >= getattr(detector, "DYNAMIC_CALIB_CORNERS", 4)
            ),
        }

    @staticmethod
    def _inactive_telemetry(
        summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "active": False,
            "worker_active": False,
            "session_id": summary.get("session_id") if summary else None,
            "session_started_at": None,
            "uid": None,
            "hardware": None,
            "tracking_mode": None,
            "focus_score": summary.get("focus_score", 0.0) if summary else 0.0,
            "status": "IDLE",
            "distraction_count": summary.get("distraction_event_count", 0)
            if summary
            else 0,
            "slouch_factor": 0.0,
            "gaze": None,
            "head_angle": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            "calibration": {
                "state": "idle",
                "corner_index": 0,
                "sample_count": 0,
                "corner_count": 0,
                "complete": False,
            },
            "updated_at": time.time(),
            "last_error": None,
        }


load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
initialize_firebase()

app = FastAPI(title="Smart FocusDesk Local Agent")
app.add_middleware(
    CORSMiddleware,
    # Add your local frontend URL here
    allow_origins=["http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = SessionManager()


@app.post("/session/start")
def start_session(config: SessionConfig) -> Dict[str, Any]:
    return manager.start_session(config)


@app.post("/session/calibrate")
def calibrate(config: SessionConfig) -> Dict[str, Any]:
    return manager.calibrate(config)


@app.post("/session/stop")
def stop_session() -> Dict[str, Any]:
    return manager.stop()


@app.get("/session/live-telemetry")
def live_telemetry() -> Dict[str, Any]:
    return manager.live_telemetry()


@app.get("/session/video-feed")
def video_feed() -> StreamingResponse:
    return StreamingResponse(
        manager.video_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
