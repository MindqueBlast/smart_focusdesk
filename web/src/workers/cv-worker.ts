/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { estimateGaze } from "../lib/cv/gaze-estimator";
import { FocusClassifier } from "../lib/cv/focus-classifier";
import { buildPostureMetrics, isPoorPosture } from "../lib/cv/posture";
import { extractFaceMetrics } from "../lib/cv/head-pose";
import { mapToFocusState } from "../lib/cv/focus-states";
import { enrichFrameWithScore } from "../lib/scoring/session-engine";
import type { FrameMetrics, TrackingMode } from "../types";

let landmarker: FaceLandmarker | null = null;
let classifier = new FocusClassifier();
let lastTimestamp = 0;
let sustainedDistractionStart: number | null = null;
let sessionStartTime: number | null = null;
let sensitivity = 1;

export type WorkerInMessage =
  | { type: "init"; modelUrl: string }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "set_tracking_mode"; mode: TrackingMode }
  | { type: "start_calibration" }
  | { type: "set_sensitivity"; value: number }
  | { type: "session_start" }
  | { type: "session_stop" };

export type WorkerOutMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "metrics"; data: FrameMetrics }
  | { type: "init_progress"; message: string };

async function initLandmarker(modelUrl: string) {
  self.postMessage({ type: "init_progress", message: "Loading vision models..." } satisfies WorkerOutMessage);

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );

  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });

  self.postMessage({ type: "ready" } satisfies WorkerOutMessage);
}

function processFrame(bitmap: ImageBitmap, timestamp: number) {
  if (!landmarker) return;

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const results = landmarker.detectForVideo(canvas, timestamp);
  const now = timestamp / 1000;
  const faceCount = results.faceLandmarks?.length ?? 0;

  if (faceCount === 0) {
    self.postMessage({
      type: "metrics",
      data: buildNoFaceMetrics(now),
    } satisfies WorkerOutMessage);
    return;
  }

  if (faceCount > 1) {
    self.postMessage({
      type: "metrics",
      data: {
        ...buildNoFaceMetrics(now),
        face_count: faceCount,
        confidence: 0.3,
      },
    } satisfies WorkerOutMessage);
    return;
  }

  const landmarks = results.faceLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  const transformMatrix = results.facialTransformationMatrixes?.[0]?.data
    ? new Float32Array(results.facialTransformationMatrixes[0].data)
    : null;
  const gaze = estimateGaze(landmarks);

  const classification = classifier.processFrame(landmarks, gaze, transformMatrix, now);
  if (!classification) {
    self.postMessage({
      type: "metrics",
      data: buildNoFaceMetrics(now),
    } satisfies WorkerOutMessage);
    return;
  }

  const faceMetrics = extractFaceMetrics(landmarks, transformMatrix ?? undefined);
  const posture = buildPostureMetrics(
    faceMetrics.s_factor,
    faceMetrics.norm_s,
    classification.effective_s,
  );

  if (classification.status !== "FOCUSED" && classification.status !== "NO FACE") {
    if (!sustainedDistractionStart) sustainedDistractionStart = now;
  } else {
    sustainedDistractionStart = null;
  }

  const sustainedDistractionSec = sustainedDistractionStart
    ? now - sustainedDistractionStart
    : 0;

  const sessionDurationMin = sessionStartTime ? (now - sessionStartTime) / 60 : 0;

  const baseMetrics = {
    timestamp: now,
    status: classification.status,
    head_angle: {
      pitch: classification.effective_pitch,
      yaw: classification.effective_yaw,
      roll: faceMetrics.roll,
    },
    posture,
    gaze: classification.gaze,
    gaze_coord: classification.gaze_coord,
    face_detected: true,
    face_count: 1,
    confidence: 0.9,
    calibration: classifier.getCalibrationState(),
    focusState: mapToFocusState({
      status: classification.status,
      effectiveS: classification.effective_s,
      sustainedDistractionSec,
      sessionDurationMin,
      currentScore: 0,
      poorPosture: isPoorPosture(classification.effective_s),
    }),
  };

  const enriched = enrichFrameWithScore(baseMetrics, sensitivity);
  enriched.focusState = mapToFocusState({
    status: classification.status,
    effectiveS: classification.effective_s,
    sustainedDistractionSec,
    sessionDurationMin,
    currentScore: enriched.current_focus_score,
    poorPosture: isPoorPosture(classification.effective_s),
  });

  self.postMessage({ type: "metrics", data: enriched } satisfies WorkerOutMessage);
}

function buildNoFaceMetrics(now: number): FrameMetrics {
  return {
    timestamp: now,
    status: "NO FACE",
    focusState: "Slightly Distracted",
    head_angle: { pitch: 0, yaw: 0, roll: 0 },
    posture: { norm_s: 0, slump_val: 0, effective_s: 0 },
    gaze: {
      horizontal_ratio: null,
      vertical_ratio: null,
      is_blinking: false,
      pupils_located: false,
    },
    gaze_coord: null,
    current_focus_score: 0,
    face_detected: false,
    face_count: 0,
    confidence: 0,
    calibration: classifier.getCalibrationState(),
  };
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "init":
        await initLandmarker(msg.modelUrl);
        break;
      case "frame":
        if (msg.timestamp <= lastTimestamp) break;
        lastTimestamp = msg.timestamp;
        processFrame(msg.bitmap, msg.timestamp);
        break;
      case "set_tracking_mode":
        classifier.trackingMode = msg.mode;
        break;
      case "start_calibration":
        classifier.startCalibration();
        break;
      case "set_sensitivity":
        sensitivity = msg.value;
        break;
      case "session_start":
        sessionStartTime = performance.now() / 1000;
        sustainedDistractionStart = null;
        break;
      case "session_stop":
        sessionStartTime = null;
        sustainedDistractionStart = null;
        break;
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Worker error",
    } satisfies WorkerOutMessage);
  }
};

export {};
