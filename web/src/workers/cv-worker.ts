/// <reference lib="webworker" />

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { estimateGaze, getInterPupillaryDistance } from "../lib/cv/gaze-estimator";
import { FocusClassifier } from "../lib/cv/focus-classifier";
import { buildPostureMetrics, isPoorPosture } from "../lib/cv/posture";
import { extractFaceMetrics } from "../lib/cv/head-pose";
import { mapToFocusState } from "../lib/cv/focus-states";
import { computeTrackingQuality } from "../lib/cv/tracking-confidence";
import { LOW_CONFIDENCE_THRESHOLD } from "../lib/cv/constants";
import { enrichFrameWithScore } from "../lib/scoring/session-engine";
import type { CalibrationOffsets, FrameMetrics, TrackingMode } from "../types";

let landmarker: FaceLandmarker | null = null;
let classifier = new FocusClassifier();
let lastTimestamp = 0;
let sustainedDistractionStart: number | null = null;
let sessionStartTime: number | null = null;
let sensitivity = 1;
let breakReminderMinutes = 90;
let offscreenCanvas: OffscreenCanvas | null = null;
let lastGoodMetrics: FrameMetrics | null = null;
let lowConfidenceFrames = 0;
let calibrationSavedEmitted = false;

export type WorkerInMessage =
  | { type: "init"; modelUrl: string }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "set_tracking_mode"; mode: TrackingMode }
  | { type: "load_calibration"; offsets: CalibrationOffsets; mode: TrackingMode }
  | { type: "start_calibration" }
  | { type: "set_sensitivity"; value: number }
  | { type: "set_break_reminder"; minutes: number }
  | { type: "session_start" }
  | { type: "session_stop" };

export type WorkerOutMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "metrics"; data: FrameMetrics }
  | { type: "init_progress"; message: string }
  | { type: "calibration_saved"; offsets: CalibrationOffsets; mode: TrackingMode };

async function initLandmarker(modelUrl: string) {
  self.postMessage({ type: "init_progress", message: "Loading vision models..." } satisfies WorkerOutMessage);

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );

  const options = {
    baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  };

  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    self.postMessage({ type: "init_progress", message: "GPU unavailable, using CPU..." } satisfies WorkerOutMessage);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
    });
  }

  self.postMessage({ type: "ready" } satisfies WorkerOutMessage);
}

function processFrame(bitmap: ImageBitmap, timestamp: number) {
  if (!landmarker) return;

  if (!offscreenCanvas) {
    offscreenCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  }
  if (offscreenCanvas.width !== bitmap.width || offscreenCanvas.height !== bitmap.height) {
    offscreenCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  }

  const ctx = offscreenCanvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const results = landmarker.detectForVideo(offscreenCanvas, timestamp);
  const now = timestamp / 1000;
  const faceCount = results.faceLandmarks?.length ?? 0;

  if (faceCount === 0) {
    lastGoodMetrics = null;
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

  const faceMetrics = extractFaceMetrics(landmarks, transformMatrix ?? undefined);
  const ipd = getInterPupillaryDistance(landmarks);
  const gaze = estimateGaze(landmarks, faceMetrics.pitch);

  const classification = classifier.processFrame(landmarks, gaze, transformMatrix, now, ipd);
  if (!classification) {
    self.postMessage({
      type: "metrics",
      data: buildNoFaceMetrics(now),
    } satisfies WorkerOutMessage);
    return;
  }

  const trackingQuality = computeTrackingQuality(landmarks, gaze);
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

  const calState = classifier.getCalibrationState(now);
  if (calState.complete && calState.stage === "complete" && !calibrationSavedEmitted) {
    calibrationSavedEmitted = true;
    self.postMessage({
      type: "calibration_saved",
      offsets: {
        offset_pitch: classifier.offsets.offset_pitch,
        offset_yaw: classifier.offsets.offset_yaw,
        offset_s: classifier.offsets.offset_s,
        dynamic_corners: [...classifier.offsets.dynamic_corners],
      },
      mode: classifier.trackingMode,
    } satisfies WorkerOutMessage);
  }

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
    confidence: trackingQuality.confidence,
    tracking_quality: trackingQuality,
    calibration: calState,
    focusState: mapToFocusState({
      status: classification.status,
      effectiveS: classification.effective_s,
      sustainedDistractionSec,
      sessionDurationMin,
      currentScore: 0,
      poorPosture: isPoorPosture(classification.effective_s),
      breakReminderMinutes,
    }),
  };

  let enriched = enrichFrameWithScore(baseMetrics, sensitivity);

  if (trackingQuality.confidence < LOW_CONFIDENCE_THRESHOLD) {
    lowConfidenceFrames += 1;
    if (lastGoodMetrics && lowConfidenceFrames < 15) {
      enriched = {
        ...lastGoodMetrics,
        timestamp: now,
        calibration: calState,
        tracking_quality: trackingQuality,
        confidence: trackingQuality.confidence,
      };
    }
  } else {
    lowConfidenceFrames = 0;
    lastGoodMetrics = enriched;
  }

  enriched.focusState = mapToFocusState({
    status: enriched.status,
    effectiveS: classification.effective_s,
    sustainedDistractionSec,
    sessionDurationMin,
    currentScore: enriched.current_focus_score,
    poorPosture: isPoorPosture(classification.effective_s),
    breakReminderMinutes,
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
    calibration: classifier.getCalibrationState(now),
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
        calibrationSavedEmitted = false;
        classifier.startCalibration();
        break;
      case "load_calibration":
        calibrationSavedEmitted = true;
        classifier.setOffsets(msg.offsets, msg.mode);
        break;
      case "set_sensitivity":
        sensitivity = msg.value;
        break;
      case "set_break_reminder":
        breakReminderMinutes = msg.minutes;
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
