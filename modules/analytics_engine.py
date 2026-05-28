import os
import time
import json
import logging
from typing import Optional, List, Dict, Any, Tuple

import cv2
from modules.firebase_backend import upload_session_summary

_LOG = logging.getLogger(__name__)

class AnalyticsEngine:
    def __init__(self, user_id: str = "local_user"):
        self.user_id = user_id
        self.session_id: Optional[str] = None
        self.session_start_time: Optional[float] = None
        self.session_end_time: Optional[float] = None
        self.ticks: List[Dict[str, Any]] = []
        self.distraction_events: List[Dict[str, Any]] = []
        self.is_active: bool = False
        
        self._last_tick_time: float = 0.0
        self._last_gaze_coord: Optional[Tuple[float, float]] = None

    def start_session(self, user_id: Optional[str] = None) -> str:
        
        """Start a new tracking telemetry session."""
        if user_id:
            self.user_id = user_id
        
        self.session_start_time = time.time()
        # Create readable but unique session ID
        time_str = time.strftime("%Y%m%d_%H%M%S", time.localtime(self.session_start_time))
        self.session_id = f"session_{time_str}"
        
        self.ticks = []
        self.distraction_events = []
        self.is_active = True
        self._last_tick_time = self.session_start_time
        self._last_gaze_coord = None
        
        _LOG.info(f"Started focus telemetry session {self.session_id} for user {self.user_id}")
        return self.session_id

    def record_frame(self, gaze: Optional[Tuple[float, float]], head_angle: Dict[str, float], posture: Dict[str, Any], status: str) -> None:
        """Process real-time frame telemetry and append a tick to the buffer if 1s has elapsed."""
        if not self.is_active:
            return

        now = time.time()
        # Implement in-memory 1s tick buffer
        if len(self.ticks) == 0 or (now - self._last_tick_time >= 1.0):
            tick = {
                "timestamp": now,
                "gaze": gaze,  # tuple (x, y) or None
                "head_angle": head_angle,  # {"pitch": ..., "yaw": ..., "roll": ...}
                "posture": posture,  # slump, norm_s, etc.
                "status": status,  # "FOCUSED", "SLOUCHING", "LOOKING AWAY", etc.
            }
            self.ticks.append(tick)
            self._last_tick_time = now

    def log_distraction_event(self, trigger_type: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Log a distraction event (such as a hardware LED trigger)."""
        if not self.is_active:
            return

        event = {
            "timestamp": time.time(),
            "trigger_type": trigger_type,
            "details": details or {}
        }
        self.distraction_events.append(event)
        _LOG.info(f"Logged distraction event '{trigger_type}' at {event['timestamp']}")

    def calculate_focus_score(self) -> Tuple[float, Dict[str, Any]]:
        """Calculate the Final Focus Score using the strict formula:
        Focus_Score = (total_percentage_focused * 0.70) + ((max_deep_focus_streak_minutes / total_duration_minutes) * 30) - (saccadic_density_score * 0.05) [Clamp 0-100]
        """
        if not self.ticks:
            return 0.0, {
                "total_percentage_focused": 0.0,
                "max_deep_focus_streak_minutes": 0.0,
                "saccadic_density_score": 0.0,
                "saccade_count": 0,
                "total_duration_minutes": 0.0
            }

        duration_seconds = 0.0
        if self.session_start_time and self.session_end_time:
            duration_seconds = self.session_end_time - self.session_start_time
        else:
            duration_seconds = max(1.0, self.ticks[-1]["timestamp"] - self.ticks[0]["timestamp"])
        
        total_duration_minutes = max(0.01, duration_seconds / 60.0)
        
        # 1. Total percentage focused
        total_ticks = len(self.ticks)
        focused_ticks = sum(1 for t in self.ticks if t["status"] == "FOCUSED")
        total_percentage_focused = (focused_ticks / total_ticks) * 100.0

        # 2. Max deep focus streak minutes
        max_streak_ticks = 0
        current_streak_ticks = 0
        for t in self.ticks:
            if t["status"] == "FOCUSED":
                current_streak_ticks += 1
                if current_streak_ticks > max_streak_ticks:
                    max_streak_ticks = current_streak_ticks
            else:
                current_streak_ticks = 0
        
        # Assuming approximately 1s per tick in our buffer
        max_deep_focus_streak_minutes = max_streak_ticks / 60.0

        # 3. Saccadic density score
        # Detect saccades where gaze Euclidean distance between consecutive ticks > 0.15
        saccade_count = 0
        prev_gaze = None
        for t in self.ticks:
            gaze = t.get("gaze")
            if prev_gaze and gaze:
                # Euclidean distance
                dist = ((gaze[0] - prev_gaze[0])**2 + (gaze[1] - prev_gaze[1])**2)**0.5
                if dist > 0.15:
                    saccade_count += 1
            if gaze:
                prev_gaze = gaze

        saccadic_density_score = saccade_count / total_duration_minutes

        # Focus Score formula
        streak_term = (max_deep_focus_streak_minutes / total_duration_minutes) * 30.0
        focus_score = (total_percentage_focused * 0.70) + streak_term - (saccadic_density_score * 0.05)
        
        # Clamp 0-100
        clamped_score = max(0.0, min(100.0, focus_score))

        stats = {
            "total_percentage_focused": total_percentage_focused,
            "max_deep_focus_streak_minutes": max_deep_focus_streak_minutes,
            "saccadic_density_score": saccadic_density_score,
            "saccade_count": saccade_count,
            "total_duration_minutes": total_duration_minutes,
            "focused_ticks": focused_ticks,
            "total_ticks": total_ticks
        }
        return clamped_score, stats

    def stop_session(self) -> Dict[str, Any]:
        """Stop the tracking session, aggregate statistics, and upload to Firestore/save locally."""
        if not self.is_active:
            raise RuntimeError("No active telemetry session to stop.")

        self.session_end_time = time.time()
        self.is_active = False

        # Calculate scores; if no ticks exist, return a safe summary immediately
        if not self.ticks:
            _LOG.warning("Session stopped with no data recorded.")
            return {"session_id": self.session_id, "total_ticks": 0, "status": "empty"}

        focus_score, stats = self.calculate_focus_score()

        summary = {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "start_time": self.session_start_time,
            "end_time": self.session_end_time,
            "total_duration_seconds": self.session_end_time - self.session_start_time,
            "total_duration_minutes": stats["total_duration_minutes"],
            "total_ticks": stats["total_ticks"],
            "focused_ticks": stats["focused_ticks"],
            "total_percentage_focused": stats["total_percentage_focused"],
            "max_deep_focus_streak_minutes": stats["max_deep_focus_streak_minutes"],
            "saccade_count": stats["saccade_count"],
            "saccadic_density_score": stats["saccadic_density_score"],
            "focus_score": round(focus_score, 2),
            "distraction_event_count": len(self.distraction_events),
            "distraction_events": self.distraction_events,
            "ticks": self.ticks
        }

        # Unconditionally save complete local backup (including raw ticks) first
        self._save_local_fallback(summary)

        # Attempt to upload to Firestore (protected against network crashes)
        try:
            upload_session_summary(self.user_id, self.session_id, summary)
        except Exception as e:
            _LOG.error(f"Network/Firebase upload failed (offline/unconfigured). Standalone safety preserved. Details: {e}")

        return summary

    def _save_local_fallback(self, summary: Dict[str, Any]) -> None:
        """Save the session summary locally to a JSON file."""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(current_dir)
        sessions_dir = os.path.join(project_root, "data", "sessions", self.user_id)
        os.makedirs(sessions_dir, exist_ok=True)
        
        file_path = os.path.join(sessions_dir, f"{self.session_id}.json")
        try:
            with open(file_path, "w") as f:
                json.dump(summary, f, indent=2)
            _LOG.info(f"Offline fallback: Session data saved locally to {file_path}")
        except Exception as e:
            _LOG.exception(f"Critical error: Failed to save local session fallback to {file_path}")
