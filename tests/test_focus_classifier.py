import unittest

import numpy as np

from modules.detector import FaceDetector


class FocusClassifierTests(unittest.TestCase):
    def make_detector_shell(self):
        detector = FaceDetector.__new__(FaceDetector)
        detector.dynamic_corners = []
        detector._combined_vec_stable = None
        detector._last_combined_ts = 0.0
        detector._ignore_until = 0.0
        return detector

    def test_centered_head_with_eyes_away_is_distracted(self):
        decision = FaceDetector._classify_fallback_focus(
            effective_yaw=0.0,
            gaze_state={"is_left": True, "is_right": False, "is_blinking": False},
        )

        self.assertEqual(decision["status"], "GAZE AWAY")
        self.assertTrue(decision["gaze_extreme"])

    def test_head_inside_limits_with_centered_gaze_is_focused(self):
        decision = FaceDetector._classify_fallback_focus(
            effective_yaw=18.0,
            gaze_state={"is_left": False, "is_right": False, "is_blinking": False},
        )

        self.assertEqual(decision["status"], "FOCUSED")
        self.assertFalse(decision["gaze_extreme"])

    def test_blinking_is_detected_when_head_is_inside_limits(self):
        decision = FaceDetector._classify_fallback_focus(
            effective_yaw=None,
            gaze_state={"is_left": False, "is_right": False, "is_blinking": True},
        )

        self.assertEqual(decision["status"], "EYES CLOSED")
        self.assertIsNone(decision["screen_gaze_x"])

    def test_hard_yaw_overrides_blink_and_eye_gaze(self):
        decision = FaceDetector._classify_fallback_focus(
            effective_yaw=FaceDetector.HARD_SAFETY_YAW_LIMIT + 1,
            gaze_state={"is_left": True, "is_right": False, "is_blinking": True},
        )

        self.assertEqual(decision["status"], "LOOKING RIGHT")
        self.assertFalse(decision["gaze_extreme"])

    def test_projection_returns_safe_finite_origin_for_invalid_vectors(self):
        detector = self.make_detector_shell()

        for vec in (None, [float("nan"), 1.0, 1.0], [1.0, 2.0, 0.0]):
            projected = detector._project_to_plane_2d(vec)

            self.assertTrue(np.all(np.isfinite(projected)))
            np.testing.assert_allclose(projected, np.array([0.0, 0.0]))

    def test_incomplete_or_degenerate_screen_quad_is_not_ready(self):
        detector = self.make_detector_shell()
        detector.dynamic_corners = [(0.0, 0.0), (1.0, 0.0)]

        self.assertFalse(detector._screen_quad_ready())
        inside, distance = detector._point_in_screen_quad(np.array([0.5, 0.5]))
        self.assertFalse(inside)
        self.assertTrue(np.isinf(distance))

        detector.dynamic_corners = [(0.0, 0.0)] * detector.DYNAMIC_CALIB_CORNERS
        self.assertFalse(detector._screen_quad_ready())

    def test_velocity_filter_recovers_after_sustained_fast_motion(self):
        detector = self.make_detector_shell()

        np.testing.assert_allclose(
            detector._update_combined_vector_with_velocity(np.array([0.0, 0.0]), 0.0),
            np.array([0.0, 0.0]),
        )
        np.testing.assert_allclose(
            detector._update_combined_vector_with_velocity(np.array([10.0, 0.0]), 0.01),
            np.array([0.0, 0.0]),
        )

        recovered = detector._update_combined_vector_with_velocity(
            np.array([10.0, 0.0]), detector.VELOCITY_IGNORE_SECONDS + 0.02
        )
        np.testing.assert_allclose(recovered, np.array([10.0, 0.0]))


if __name__ == "__main__":
    unittest.main()
