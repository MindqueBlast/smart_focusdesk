from pathlib import Path
import argparse
from datetime import datetime
import cv2
import numpy as np

from modules.detector import FaceDetector


def _safe_stats(values):
    if not values:
        return None
    arr = np.array(values, dtype=np.float64)
    return {
        "avg": float(np.mean(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
    }


def process_video(video_path: Path, detector: FaceDetector):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {
            "video": video_path.name,
            "error": "Could not open video",
        }

    detector.previous_landmarks = None

    pitch_values = []
    yaw_values = []
    norm_s_values = []

    frame_count = 0
    face_frames = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        frame_count += 1
        results = detector.find_landmarks(frame)
        if not results or not results.face_landmarks:
            continue

        face_frames += 1
        h, w = frame.shape[:2]
        metrics = detector.extract_face_metrics(results.face_landmarks[0], w, h)

        pitch_values.append(metrics["pitch"])
        yaw_values.append(metrics["yaw"])
        norm_s_values.append(metrics["norm_s"])

    cap.release()

    return {
        "video": video_path.name,
        "frame_count": frame_count,
        "face_frames": face_frames,
        "pitch": _safe_stats(pitch_values),
        "yaw": _safe_stats(yaw_values),
        "norm_s": _safe_stats(norm_s_values),
    }


def write_summary(results, output_path: Path):
    lines = []
    lines.append("Smart Focus Calibration Summary")
    lines.append("=" * 32)
    lines.append("")

    if not results:
        lines.append("No videos were processed.")
        output_path.write_text("\n".join(lines), encoding="utf-8")
        return

    for item in results:
        lines.append(f"Video: {item['video']}")

        if "error" in item:
            lines.append(f"  Error: {item['error']}")
            lines.append("")
            continue

        lines.append(f"  Frames: {item['frame_count']} total, {item['face_frames']} with face")

        for key, label in (("pitch", "Pitch"), ("yaw", "Yaw"), ("norm_s", "Norm S")):
            stats = item[key]
            if stats is None:
                lines.append(f"  {label}: N/A")
                continue
            lines.append(
                f"  {label}: Avg={stats['avg']:.2f}  Min={stats['min']:.2f}  Max={stats['max']:.2f}"
            )

        if item["yaw"] is not None:
            lines.append(
                f"In {item['video']}, the Max Yaw was {item['yaw']['max']:.2f}."
            )
        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Batch calibration for Smart Focus videos.")
    parser.add_argument(
        "--videos-dir",
        default="data/videos",
        help="Folder containing .mp4 files (default: data/videos).",
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Base data folder for outputs (default: data).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional summary output path. Defaults to data/results_YYYY-MM-DD_HHMMSS.txt",
    )
    args = parser.parse_args()

    videos_dir = Path(args.videos_dir)
    data_dir = Path(args.data_dir)
    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        output_path = data_dir / f"results_{timestamp}.txt"

    if not videos_dir.exists() or not videos_dir.is_dir():
        raise FileNotFoundError(f"Videos directory not found: {videos_dir}")
    data_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    video_paths = sorted(videos_dir.glob("*.mp4"))
    detector = FaceDetector()

    all_results = []
    for video_path in video_paths:
        print(f"Processing {video_path.name}...")
        all_results.append(process_video(video_path, detector))

    write_summary(all_results, output_path)
    print(f"Done. Wrote summary to {output_path}")


if __name__ == "__main__":
    main()
