import cv2
import time
import os
import sys
from modules.detector import FaceDetector
from modules.analytics_engine import AnalyticsEngine

# Global tracking mode: 'DYNAMIC_MAPPING' or 'CALIBRATED_THRESHOLDS'
# Switch to 'DYNAMIC_MAPPING' to enable 4-corner calibration and 3D mapping.
TRACKING_MODE = "DYNAMIC_MAPPING"  # Change to 'DYNAMIC_MAPPING' for the new mode


def main():
    print("--- System Starting ---")
    
    # 1. Initialize Detector FIRST
    # If it hangs here, we'll know it's the AI model, not the camera
    print("Step 1: Loading AI Model...")
    detector = FaceDetector(tracking_mode=TRACKING_MODE)
    print(f"Tracking mode: {TRACKING_MODE}")
    print("Step 2: AI Model Ready.")

    # 2. Initialize Camera with the DirectShow fix
    print("Step 3: Opening Camera...")
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

    # Set resolution low for speed
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("Step 4: Warming up...")
    time.sleep(1)  # Reduced sleep
    print(
        "--- System Active!  C: calibrate  |  P: toggle analysis panel  |  F: flip camera  |  Q: quit ---"
    )
    # Camera flip toggle
    flip_camera = False

    # Initialize Analytics Engine
    user_id = os.environ.get("SMART_FOCUS_USER_ID", "local_user")
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    
    analytics = AnalyticsEngine(user_id=user_id)
    analytics.start_session()
    prev_alert_active = False

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            # Optionally flip camera BEFORE detection (so panel/text stay upright)
            if flip_camera:
                frame = cv2.flip(frame, 1)  # 1 = horizontal flip
                detector.YAW_SIGN = -1  # Adjust for flipped orientation
            else:
                detector.YAW_SIGN = 1  # Default orientation

            # 3. Detect & Draw
            # We wrap this in a try/except so if one frame fails, the window doesn't crash
            try:
                detector.refresh_gaze(frame)
                results = detector.find_landmarks(frame)
                frame = detector.draw_on_frame(frame, results)
                detector.draw_frame_chrome(frame)
                
                # Display gaze source label
                gaze_source = getattr(detector, '_last_gaze_state', {}).get('source')
                if gaze_source:
                    cv2.putText(
                        frame,
                        f"Gaze source: {gaze_source}",
                        (10, 25),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 255, 255),
                        2,
                        cv2.LINE_AA,
                    )
                # Display normalized screen coordinate
                coord = detector.get_normalized_screen_coord()
                if coord:
                    h, w = frame.shape[:2]
                    cv2.putText(
                        frame,
                        f"Screen: ({coord[0]:.2f}, {coord[1]:.2f})",
                        (10, frame.shape[0] - 20),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 255),
                        1,
                        cv2.LINE_AA,
                    )

                # Telemetry tracking integration
                gaze = detector.last_gaze_coord
                head_angle = {
                    "pitch": detector.last_pitch,
                    "yaw": detector.last_yaw,
                    "roll": detector.last_roll
                }
                posture = {
                    "norm_s": detector.last_norm_s,
                    "slump_val": getattr(detector, "_last_face_hud", {}).get("norm_s", 0.0) if detector._last_face_hud else 0.0
                }
                analytics.record_frame(gaze, head_angle, posture, detector.last_status)

                # Log hardware LED distraction events
                alert_active = getattr(detector, "_alert_active", False)
                if alert_active and not prev_alert_active:
                    analytics.log_distraction_event("LED_DISTRACTION_ALERT_ON", {
                        "reason": detector.last_status,
                        "yaw": detector.last_yaw,
                        "pitch": detector.last_pitch
                    })
                elif not alert_active and prev_alert_active:
                    analytics.log_distraction_event("LED_DISTRACTION_ALERT_OFF")
                prev_alert_active = alert_active

            except Exception as e:
                # Print error so user can see what went wrong (helps debugging)
                import traceback

                print("Detector error:")
                traceback.print_exc()

            # 4. Display
            cv2.imshow("Smart Focus Desk", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("p"):
                detector.toggle_analysis_panel()
            if key == ord("c"):
                detector.start_calibration()
            if key == ord("f"):
                flip_camera = not flip_camera
                print(f"Camera flip: {flip_camera}")

    finally:
        print("\n--- Stopping Session & Saving Analytics ---")
        try:
            summary = analytics.stop_session()
            print(f"Session: {summary['session_id']}")
            print(f"Focus Score: {summary['focus_score']:.2f}/100")
            print(f"Focused percentage: {summary['total_percentage_focused']:.1f}%")
            print(f"Max Deep Streak: {summary['max_deep_focus_streak_minutes']:.2f} mins")
            print(f"Saccadic Density: {summary['saccadic_density_score']:.2f} saccades/min")
            if summary.get("distraction_event_count", 0) > 0:
                print(f"Distraction alerts triggered: {summary['distraction_event_count']}")
        except Exception as e:
            print(f"Error saving analytics session: {e}")

        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
