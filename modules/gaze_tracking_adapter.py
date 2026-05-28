import sys
from pathlib import Path
import numpy as np
import time


class GazeTrackingAdapter:
    def __init__(self):
        self._gaze = None
        self.error = None
        self._load()

    def _load(self):
        repo_root = Path(__file__).resolve().parent.parent
        gaze_repo = repo_root / "external" / "GazeTracking"
        if gaze_repo.exists():
            gaze_path = str(gaze_repo)
            if gaze_path not in sys.path:
                sys.path.insert(0, gaze_path)

        try:
            from gaze_tracking import GazeTracking

            self._gaze = GazeTracking()
            self.error = None
        except Exception as exc:
            self._gaze = None
            self.error = exc

    @property
    def available(self):
        return self._gaze is not None

    def refresh(self, frame):
        if self._gaze is None:
            return
        try:
            # Ensure frame is contiguous uint8 array (dlib/opencv expectations)
            if frame is None:
                return
            frame = np.ascontiguousarray(frame)
            if frame.dtype != np.uint8:
                frame = frame.astype(np.uint8, copy=False)

            self._gaze.refresh(frame)
            self.error = None
        except Exception as exc:
            self.error = exc
            # Prevent the caller from failing if the external tracker throws
            if self._gaze is not None:
                self._gaze.frame = frame
                self._gaze.eye_left = None
                self._gaze.eye_right = None

    def _call_bool(self, method_name):
        if self._gaze is None:
            return False
        method = getattr(self._gaze, method_name, None)
        if method is None:
            return False
        try:
            return method() is True
        except Exception as exc:
            self.error = exc
            return False

    def is_left(self):
        return self._call_bool("is_left")

    def is_right(self):
        return self._call_bool("is_right")

    def is_blinking(self):
        return self._call_bool("is_blinking")

    def pupils_located(self):
        if self._gaze is None:
            return False
        try:
            return bool(self._gaze.pupils_located)
        except Exception as exc:
            self.error = exc
            return False

    def _call_ratio(self, method_name):
        if self._gaze is None:
            return None
        method = getattr(self._gaze, method_name, None)
        if method is None:
            return None
        try:
            value = method()
        except Exception as exc:
            self.error = exc
            return None
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def metrics(self):
        return {
            "available": self.available,
            "pupils_located": self.pupils_located(),
            "is_blinking": self.is_blinking(),
            "is_left": self.is_left(),
            "is_right": self.is_right(),
            "horizontal_ratio": self._call_ratio("horizontal_ratio"),
            "vertical_ratio": self._call_ratio("vertical_ratio"),
            "error": self.error,
            "source": "GazeTracking",
        }

    def start_calibration(self):
        """Reset and start the embedded GazeTracking calibration process."""
        if self._gaze is None:
            return
        cal = getattr(self._gaze, "calibration", None)
        if cal is None:
            return
        # reset collected thresholds
        try:
            cal.thresholds_left = []
            cal.thresholds_right = []
        except Exception:
            pass
        self._calibrating_started = time.monotonic()

    def calibration_progress(self):
        """Return progress 0.0-1.0 of the embedded calibration if available."""
        if self._gaze is None:
            return 1.0
        cal = getattr(self._gaze, "calibration", None)
        if cal is None:
            return 1.0
        try:
            left = len(getattr(cal, "thresholds_left", []))
            right = len(getattr(cal, "thresholds_right", []))
            nb = getattr(cal, "nb_frames", 20)
            return min(1.0, (left + right) / float(2 * nb))
        except Exception:
            return 1.0

    def calibration_complete(self):
        if self._gaze is None:
            return False
        cal = getattr(self._gaze, "calibration", None)
        if cal is None:
            return False
        try:
            return cal.is_complete()
        except Exception:
            return False
