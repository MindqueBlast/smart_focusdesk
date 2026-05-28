import unittest

import numpy as np

from modules.detector import FaceDetector


class HudAttentionTests(unittest.TestCase):
    def make_detector_shell(self):
        detector = FaceDetector.__new__(FaceDetector)
        detector.show_analysis_panel = False
        detector._last_face_hud = None
        detector._alert_active = False
        detector.ALERT_FLASH_PERIOD_SECONDS = 0.4
        return detector

    def test_format_duration_binds_as_instance_method(self):
        detector = self.make_detector_shell()

        self.assertEqual(detector._format_duration(65), "01:05")

    def test_distraction_alert_accepts_frame_as_bound_method(self):
        detector = self.make_detector_shell()
        frame = np.zeros((20, 20, 3), dtype=np.uint8)

        detector._draw_distraction_alert(frame)

    def test_hidden_analysis_panel_does_not_draw_replacement_chip(self):
        detector = self.make_detector_shell()
        frame = np.zeros((80, 120, 3), dtype=np.uint8)

        detector.draw_frame_chrome(frame)

        self.assertFalse(np.any(frame))


if __name__ == "__main__":
    unittest.main()
