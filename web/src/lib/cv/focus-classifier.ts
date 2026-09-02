import {
  DYNAMIC_CALIB_CORNERS,
  CALIBRATION_COUNTDOWN_SECONDS,
  CALIBRATION_SAMPLES,
  EDGE_NEAR_THRESH,
  HARD_SAFETY_YAW_LIMIT,
  PITCH_DOWN_THRESHOLD,
  SOFT_YAW_THRESHOLD,
  STATUS_DEBOUNCE_FRAMES,
  VECTOR_EMA_ALPHA,
  VELOCITY_IGNORE_SECONDS,
  VELOCITY_THRESHOLD,
} from "./constants";
import { computeEyeOffset, getInterPupillaryDistance, isGazeExtreme } from "./gaze-estimator";
import { applyCalibration, extractFaceMetrics } from "./head-pose";
import { isPoorPosture } from "./posture";
import { applyLandmarkSmoothing } from "./smoothing";
import {
  pointInPolygon,
  polygonArea,
  projectToPlane2d,
  type Landmark,
  type Vec2,
  type Vec3,
} from "./math-utils";
import type {
  CalibrationOffsets,
  CalibrationState,
  GazeMetrics,
  InternalStatus,
  TrackingMode,
} from "@/types";

export interface ClassificationResult {
  status: InternalStatus;
  reason: string;
  gaze_coord: Vec2 | null;
  gaze: GazeMetrics;
  effective_yaw: number;
  effective_pitch: number;
  effective_s: number;
}

export class FocusClassifier {
  trackingMode: TrackingMode = "CALIBRATED_THRESHOLDS";
  offsets: CalibrationOffsets = {
    offset_pitch: 0,
    offset_yaw: 0,
    offset_s: 0,
    dynamic_corners: [],
  };

  private calibrated = false;
  private previousLandmarks: Landmark[] | null = null;
  private calibrationState = "idle";
  private calibrationStartedAt = 0;
  private calibrationSamples: [number, number, number][] = [];
  private calibrationDoneUntil = 0;
  private dynamicCornerIdx = 0;
  private combinedVecStable: Vec2 | null = null;
  private lastCombinedTs = 0;
  private ignoreUntil = 0;
  private blinkFrames = 0;
  private pendingStatus: InternalStatus | null = null;
  private pendingStatusFrames = 0;
  private currentStatus: InternalStatus = "FOCUSED";
  private smoothedYaw = 0;
  private smoothedPitch = 0;
  private positionOkFrames = 0;

  setOffsets(offsets: CalibrationOffsets, mode: TrackingMode): void {
    this.offsets = { ...offsets, dynamic_corners: [...offsets.dynamic_corners] };
    this.trackingMode = mode;
    this.calibrated = true;
    this.calibrationState = "idle";
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  startCalibration(): void {
    if (this.trackingMode === "DYNAMIC_MAPPING") {
      this.calibrationState = "corner_countdown";
      this.dynamicCornerIdx = 0;
      this.offsets.dynamic_corners = [];
      this.calibrationSamples = [];
    } else {
      this.calibrationState = "countdown";
      this.calibrationSamples = [];
    }
    this.calibrated = false;
    this.calibrationStartedAt = performance.now() / 1000;
  }

  getCalibrationState(now = performance.now() / 1000): CalibrationState {
    const inGrace =
      this.calibrationState === "idle" &&
      now < this.calibrationDoneUntil + 0.01;

    let stage = "idle";
    if (this.calibrationState === "countdown" || this.calibrationState === "corner_countdown") {
      stage = "countdown";
    } else if (this.calibrationState === "sampling" || this.calibrationState === "corner_sampling") {
      stage = "sampling";
    } else if (this.calibrated && !inGrace) {
      stage = "complete";
    } else if (this.calibrationState === "idle" && !this.calibrated) {
      stage = "intro";
    }

    const totalSteps =
      this.trackingMode === "DYNAMIC_MAPPING" ? DYNAMIC_CALIB_CORNERS + 1 : 1;
    const currentStep =
      this.trackingMode === "DYNAMIC_MAPPING"
        ? this.dynamicCornerIdx + (this.calibrationState.includes("sampling") ? 1 : 0)
        : this.calibrationState === "sampling" || this.calibrated
          ? 1
          : 0;

    const countdownRemaining =
      this.calibrationState === "countdown" || this.calibrationState === "corner_countdown"
        ? Math.max(0, CALIBRATION_COUNTDOWN_SECONDS - (now - this.calibrationStartedAt))
        : undefined;

    return {
      state: this.calibrationState,
      stage,
      corner_index: this.dynamicCornerIdx,
      sample_count: this.calibrationSamples.length,
      corner_count: DYNAMIC_CALIB_CORNERS,
      complete: this.calibrated && !inGrace,
      progress_pct: Math.min(100, (currentStep / totalSteps) * 100),
      position_ok: this.positionOkFrames >= 5,
      quality: Math.min(1, this.positionOkFrames / 10),
      countdown_remaining: countdownRemaining,
    };
  }

  processFrame(
    landmarks: Landmark[] | null,
    gaze: GazeMetrics,
    transformMatrix?: Float32Array | null,
    now = performance.now() / 1000,
    ipd = 0.1,
  ): ClassificationResult | null {
    this.advanceCalibration(now);

    if (!landmarks || landmarks.length < 478) {
      return null;
    }

    const nose = landmarks[4];
    const centered = nose.x > 0.3 && nose.x < 0.7 && nose.y > 0.25 && nose.y < 0.75;
    this.positionOkFrames = centered ? this.positionOkFrames + 1 : 0;

    const { smoothed, previous } = applyLandmarkSmoothing(landmarks, this.previousLandmarks);
    this.previousLandmarks = previous;

    const metrics = extractFaceMetrics(smoothed, transformMatrix ?? undefined);
    const calibrated = applyCalibration(metrics, this.offsets);

    this.smoothedYaw = this.smoothedYaw * 0.7 + calibrated.effective_yaw * 0.3;
    this.smoothedPitch = this.smoothedPitch * 0.7 + calibrated.effective_pitch * 0.3;

    this.captureCalibrationSample(
      metrics.pitch,
      metrics.yaw,
      metrics.norm_s,
      calibrated.head_vector,
      gaze,
      now,
      ipd,
    );

    const rawBlink = gaze.is_blinking;
    this.blinkFrames = rawBlink ? this.blinkFrames + 1 : 0;
    const eyesClosed = this.blinkFrames >= 2;

    let decision = classifyFallbackFocus(this.smoothedYaw, this.smoothedPitch, {
      ...gaze,
      is_blinking: eyesClosed,
    });

    let status = this.debounceStatus(decision.status);
    let reason = decision.reason;

    const eyeOffset = computeEyeOffset(gaze, ipd);
    const finalGaze: Vec3 = [
      calibrated.head_vector[0] + eyeOffset[0],
      calibrated.head_vector[1] + eyeOffset[1],
      calibrated.head_vector[2] + eyeOffset[2],
    ];
    const projected = projectToPlane2d(finalGaze);
    let gazeCoord: Vec2 = projected;

    if (this.trackingMode === "DYNAMIC_MAPPING" && this.screenQuadReady()) {
      const stable = this.updateCombinedVectorWithVelocity(projected, now);
      gazeCoord = stable;
      const { inside, dist } = pointInPolygon(stable, this.offsets.dynamic_corners);
      const headForward = Math.abs(calibrated.effective_yaw) <= HARD_SAFETY_YAW_LIMIT;
      const eyesOpen = !eyesClosed;

      if (!headForward && inside && eyesOpen) {
        status = this.debounceStatus("FOCUSED");
        reason = "Lazy head: eyes on screen";
      }

      if (headForward && !inside && Math.abs(dist) < EDGE_NEAR_THRESH) {
        status = this.debounceStatus("LOOKING AWAY");
        reason = "Look-ahead: eyes past screen edge";
      }
    }

    if (isPoorPosture(calibrated.effective_s) && status === "FOCUSED") {
      status = this.debounceStatus("SLOUCHING");
      reason = "Posture slouch detected";
    }

    return {
      status,
      reason,
      gaze_coord: gazeCoord,
      gaze,
      effective_yaw: calibrated.effective_yaw,
      effective_pitch: calibrated.effective_pitch,
      effective_s: calibrated.effective_s,
    };
  }

  private debounceStatus(candidate: InternalStatus): InternalStatus {
    if (candidate === this.currentStatus) {
      this.pendingStatus = null;
      this.pendingStatusFrames = 0;
      return this.currentStatus;
    }

    if (candidate === this.pendingStatus) {
      this.pendingStatusFrames += 1;
      if (this.pendingStatusFrames >= STATUS_DEBOUNCE_FRAMES) {
        this.currentStatus = candidate;
        this.pendingStatus = null;
        this.pendingStatusFrames = 0;
      }
    } else {
      this.pendingStatus = candidate;
      this.pendingStatusFrames = 1;
    }

    return this.currentStatus;
  }

  private advanceCalibration(now: number): void {
    if (this.trackingMode !== "DYNAMIC_MAPPING") {
      if (this.calibrationState === "countdown") {
        if (now - this.calibrationStartedAt >= CALIBRATION_COUNTDOWN_SECONDS) {
          this.calibrationState = "sampling";
          this.calibrationSamples = [];
        }
      }
      return;
    }

    if (this.calibrationState === "corner_countdown") {
      if (now - this.calibrationStartedAt >= CALIBRATION_COUNTDOWN_SECONDS) {
        this.calibrationState = "corner_sampling";
        this.calibrationSamples = [];
      }
    }
  }

  private captureCalibrationSample(
    pitch: number,
    yaw: number,
    normS: number,
    headVector: Vec3,
    gaze: GazeMetrics,
    now: number,
    ipd: number,
  ): void {
    if (this.trackingMode !== "DYNAMIC_MAPPING") {
      if (this.calibrationState !== "sampling") return;
      this.calibrationSamples.push([pitch, yaw, normS]);
      if (this.calibrationSamples.length >= CALIBRATION_SAMPLES) {
        const avg = averageSamples(this.calibrationSamples);
        this.offsets.offset_pitch = avg[0];
        this.offsets.offset_yaw = avg[1];
        this.offsets.offset_s = avg[2];
        this.calibrationState = "idle";
        this.calibrationSamples = [];
        this.calibrationDoneUntil = now + 0.8;
        this.calibrated = true;
      }
      return;
    }

    if (this.calibrationState !== "corner_sampling") return;

    const eyeOffset = computeEyeOffset(gaze, ipd);
    const finalGaze: Vec3 = [
      headVector[0] + eyeOffset[0],
      headVector[1] + eyeOffset[1],
      headVector[2] + eyeOffset[2],
    ];
    const projected = projectToPlane2d(finalGaze);

    this.calibrationSamples.push([projected[0], projected[1], 0]);
    if (this.calibrationSamples.length >= CALIBRATION_SAMPLES) {
      const avg = averageSamples(this.calibrationSamples);
      this.offsets.dynamic_corners.push([avg[0], avg[1]]);
      this.calibrationSamples = [];
      this.dynamicCornerIdx += 1;

      if (this.dynamicCornerIdx >= DYNAMIC_CALIB_CORNERS) {
        if (polygonArea(this.offsets.dynamic_corners) > 1e-6) {
          this.calibrationState = "idle";
          this.calibrationDoneUntil = now + 0.8;
          this.calibrated = true;
        } else {
          this.offsets.dynamic_corners = [];
          this.dynamicCornerIdx = 0;
          this.calibrationState = "corner_countdown";
          this.calibrationStartedAt = now;
        }
      } else {
        this.calibrationState = "corner_countdown";
        this.calibrationStartedAt = now;
      }
    }
  }

  private screenQuadReady(): boolean {
    if (this.offsets.dynamic_corners.length !== DYNAMIC_CALIB_CORNERS) return false;
    return polygonArea(this.offsets.dynamic_corners) > 1e-6;
  }

  private updateCombinedVectorWithVelocity(candidate: Vec2, now: number): Vec2 {
    if (!this.combinedVecStable) {
      this.combinedVecStable = candidate;
      this.lastCombinedTs = now;
      return candidate;
    }

    const dt = Math.max(1e-6, now - this.lastCombinedTs);
    const vel =
      Math.hypot(candidate[0] - this.combinedVecStable[0], candidate[1] - this.combinedVecStable[1]) / dt;

    if (now < this.ignoreUntil) return this.combinedVecStable;

    if (vel > VELOCITY_THRESHOLD) {
      this.ignoreUntil = now + VELOCITY_IGNORE_SECONDS;
      return this.combinedVecStable;
    }

    const a = VECTOR_EMA_ALPHA;
    this.combinedVecStable = [
      a * candidate[0] + (1 - a) * this.combinedVecStable[0],
      a * candidate[1] + (1 - a) * this.combinedVecStable[1],
    ];
    this.lastCombinedTs = now;
    this.ignoreUntil = 0;
    return this.combinedVecStable;
  }
}

function averageSamples(samples: [number, number, number][]): [number, number, number] {
  const n = samples.length;
  const sum = samples.reduce(
    (acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]] as [number, number, number],
    [0, 0, 0] as [number, number, number],
  );
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

export function classifyFallbackFocus(
  effectiveYaw: number,
  effectivePitch: number,
  gaze: GazeMetrics,
): { status: InternalStatus; reason: string } {
  if (Math.abs(effectiveYaw) > HARD_SAFETY_YAW_LIMIT) {
    return {
      status: effectiveYaw > 0 ? "LOOKING RIGHT" : "LOOKING LEFT",
      reason: "Hard safety yaw exceeded",
    };
  }

  if (Math.abs(effectiveYaw) > SOFT_YAW_THRESHOLD) {
    return {
      status: "LOOKING AWAY",
      reason: "Head turned away from screen",
    };
  }

  if (effectivePitch > PITCH_DOWN_THRESHOLD) {
    return { status: "LOOKING DOWN", reason: "Head pitched down" };
  }

  if (gaze.is_blinking) {
    return { status: "EYES CLOSED", reason: "Blink detected" };
  }

  if (isGazeExtreme(gaze)) {
    return { status: "GAZE AWAY", reason: "Eye gaze off center" };
  }

  return { status: "FOCUSED", reason: "Head within limits; gaze centered" };
}

export function isDistractedStatus(status: InternalStatus): boolean {
  return [
    "LOOKING AWAY",
    "LOOKING LEFT",
    "LOOKING RIGHT",
    "SLOUCHING",
    "EYES CLOSED",
    "GAZE AWAY",
    "LOOKING DOWN",
    "FACE LOST",
  ].includes(status);
}

export function getCalibrationOffsets(classifier: FocusClassifier): CalibrationOffsets {
  return {
    ...classifier.offsets,
    dynamic_corners: [...classifier.offsets.dynamic_corners],
  };
}
