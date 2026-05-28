import unittest
import os
import shutil
import json
import time
from unittest.mock import patch, MagicMock
from modules.analytics_engine import AnalyticsEngine

class TestAnalyticsEngine(unittest.TestCase):
    def setUp(self):
        # We will create a fresh analytics engine for each test
        self.engine = AnalyticsEngine(user_id="test_user")

    def tearDown(self):
        # Clean up any local session files created during tests
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(current_dir)
        test_sessions_dir = os.path.join(project_root, "data", "sessions", "test_user")
        if os.path.exists(test_sessions_dir):
            shutil.rmtree(test_sessions_dir)

    def test_start_session(self):
        session_id = self.engine.start_session()
        self.assertTrue(self.engine.is_active)
        self.assertEqual(self.engine.user_id, "test_user")
        self.assertIsNotNone(self.engine.session_id)
        self.assertEqual(len(self.engine.ticks), 0)
        self.assertEqual(len(self.engine.distraction_events), 0)

    def test_record_frame_1s_buffering(self):
        self.engine.start_session()
        
        # First frame should record a tick immediately
        self.engine.record_frame(
            gaze=(0.5, 0.5),
            head_angle={"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            posture={"norm_s": 0.5},
            status="FOCUSED"
        )
        self.assertEqual(len(self.engine.ticks), 1)
        
        # A frame recorded immediately after should NOT create a new tick (buffered!)
        self.engine.record_frame(
            gaze=(0.6, 0.6),
            head_angle={"pitch": 1.0, "yaw": 1.0, "roll": 1.0},
            posture={"norm_s": 0.5},
            status="FOCUSED"
        )
        self.assertEqual(len(self.engine.ticks), 1)

        # Mocking passage of 1.1 seconds
        self.engine._last_tick_time -= 1.1
        self.engine.record_frame(
            gaze=(0.4, 0.4),
            head_angle={"pitch": 2.0, "yaw": 2.0, "roll": 2.0},
            posture={"norm_s": 0.6},
            status="LOOKING AWAY"
        )
        self.assertEqual(len(self.engine.ticks), 2)
        self.assertEqual(self.engine.ticks[1]["status"], "LOOKING AWAY")

    def test_distraction_event_logging(self):
        self.engine.start_session()
        self.engine.log_distraction_event("LED_DISTRACTION_ALERT_ON", {"reason": "LOOKING AWAY"})
        self.assertEqual(len(self.engine.distraction_events), 1)
        self.assertEqual(self.engine.distraction_events[0]["trigger_type"], "LED_DISTRACTION_ALERT_ON")
        self.assertEqual(self.engine.distraction_events[0]["details"]["reason"], "LOOKING AWAY")

    def test_calculate_focus_score_strict_formula(self):
        # We manually craft ticks to test the formula.
        # Let's say:
        # Total duration = 2.0 minutes (120 seconds)
        # Total ticks = 120 (approx 1s per tick)
        # Focused ticks = 90 (75% focused)
        # Max deep focus streak = 60 consecutive focused ticks (1.0 minute streak)
        # Saccade count: let's generate 4 saccades (shifts in gaze > 0.15)
        # Ticks: 
        # Ticks 0 to 59: "FOCUSED" (60 ticks, gaze = (0.5, 0.5))
        # Tick 60: "LOOKING AWAY" (gaze = (0.7, 0.7) -> shift of 0.28 (Saccade #1))
        # Ticks 61 to 89: "FOCUSED" (29 ticks, gaze = (0.5, 0.5) -> shift of 0.28 (Saccade #2))
        # Tick 90: "LOOKING LEFT" (gaze = (0.3, 0.5) -> shift of 0.2 (Saccade #3))
        # Ticks 91 to 99: "SLOUCHING" (gaze = (0.3, 0.5))
        # Ticks 100 to 119: "LOOKING AWAY" (gaze = (0.5, 0.5) -> shift of 0.2 (Saccade #4))
        
        self.engine.start_session()
        self.engine.session_start_time = 1000.0
        self.engine.session_end_time = 1120.0  # Exactly 120 seconds = 2.0 minutes
        
        ticks = []
        for i in range(120):
            timestamp = 1000.0 + float(i)
            # Default gaze is center
            gaze = (0.5, 0.5)
            status = "FOCUSED"
            
            if i == 60:
                status = "LOOKING AWAY"
                gaze = (0.7, 0.7) # Saccade 1 (from (0.5, 0.5) at tick 59 to (0.7, 0.7))
            elif 61 <= i <= 89:
                status = "FOCUSED"
                if i == 61:
                    gaze = (0.5, 0.5) # Saccade 2 (from (0.7, 0.7) at tick 60 to (0.5, 0.5))
            elif i == 90:
                status = "LOOKING LEFT"
                gaze = (0.3, 0.5) # Saccade 3 (from (0.5, 0.5) to (0.3, 0.5))
            elif 91 <= i <= 99:
                status = "SLOUCHING"
                gaze = (0.3, 0.5)
            elif 100 <= i <= 119:
                status = "LOOKING AWAY"
                if i == 100:
                    gaze = (0.5, 0.5) # Saccade 4 (from (0.3, 0.5) to (0.5, 0.5))
            
            ticks.append({
                "timestamp": timestamp,
                "gaze": gaze,
                "head_angle": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
                "posture": {"norm_s": 0.5},
                "status": status
            })
            
        self.engine.ticks = ticks
        score, stats = self.engine.calculate_focus_score()
        
        # Verify inputs:
        # Total ticks = 120
        # Focused ticks = 60 + 29 = 89
        # total_percentage_focused = (89 / 120) * 100 = 74.1666%
        # max_deep_focus_streak_ticks = 60 (ticks 0 to 59)
        # max_deep_focus_streak_minutes = 60 / 60.0 = 1.0 minute
        # total_duration_minutes = 120.0 / 60.0 = 2.0 minutes
        # Saccades = 4 (at ticks 60, 61, 90, 100)
        # saccadic_density_score = 4 / 2.0 = 2.0 saccades/min
        
        self.assertAlmostEqual(stats["total_percentage_focused"], 74.1666666, places=4)
        self.assertEqual(stats["max_deep_focus_streak_minutes"], 1.0)
        self.assertEqual(stats["saccade_count"], 4)
        self.assertEqual(stats["saccadic_density_score"], 2.0)
        self.assertEqual(stats["total_duration_minutes"], 2.0)
        
        # Formula: Focus_Score = (74.166666 * 0.70) + ((1.0 / 2.0) * 30) - (2.0 * 0.05)
        # = 51.916666 + 15.0 - 0.10 = 66.816666
        expected_score = (74.1666666 * 0.70) + ((1.0 / 2.0) * 30.0) - (2.0 * 0.05)
        self.assertAlmostEqual(score, expected_score, places=4)

    @patch("modules.analytics_engine.upload_session_summary", return_value=False)
    def test_local_fallback_saving(self, mock_upload):
        self.engine.start_session()
        self.engine.ticks = [
            {
                "timestamp": time.time(),
                "gaze": (0.5, 0.5),
                "head_angle": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
                "posture": {"norm_s": 0.5},
                "status": "FOCUSED"
            }
        ]
        
        summary = self.engine.stop_session()
        
        # Verify fallback path: mock_upload should have been called
        mock_upload.assert_called_once()
        
        # Verify file exists locally
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(current_dir)
        local_file_path = os.path.join(project_root, "data", "sessions", "test_user", f"{self.engine.session_id}.json")
        self.assertTrue(os.path.exists(local_file_path))
        
        # Load and verify JSON content
        with open(local_file_path, "r") as f:
            data = json.load(f)
            
        self.assertEqual(data["session_id"], self.engine.session_id)
        self.assertEqual(data["user_id"], "test_user")
        self.assertEqual(data["total_ticks"], 1)
        self.assertEqual(len(data["ticks"]), 1)
        self.assertIn("focus_score", data)

if __name__ == "__main__":
    unittest.main()
