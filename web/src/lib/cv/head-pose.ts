import {
  CHIN_IDX,
  FOREHEAD_IDX,
  NOSE_TIP_IDX,
  PNP_INDICES,
  YAW_SIGN,
} from "./constants";
import {
  extractEulerFromMatrix,
  headVectorFromMatrix,
  type HeadEuler,
  type Landmark,
  type Vec3,
} from "./math-utils";

export interface FaceMetrics {
  pitch: number;
  yaw: number;
  roll: number;
  s_factor: number;
  norm_s: number;
  head_vector: Vec3;
}

export function extractFaceMetrics(
  landmarks: Landmark[],
  transformMatrix?: Float32Array | number[] | null,
): FaceMetrics {
  const nose = landmarks[NOSE_TIP_IDX];
  const chin = landmarks[CHIN_IDX];
  const forehead = landmarks[FOREHEAD_IDX];

  const slumpVal = Math.abs(nose.y - chin.y);
  const faceHeight = Math.abs(forehead.y - chin.y);
  const normS = faceHeight !== 0 ? slumpVal / faceHeight : 0;

  let euler: HeadEuler = { pitch: 0, yaw: 0, roll: 0 };
  let headVector: Vec3 = [0, 0, 1];

  if (transformMatrix && transformMatrix.length >= 16) {
    euler = extractEulerFromMatrix(transformMatrix);
    headVector = headVectorFromMatrix(transformMatrix);
  } else {
    euler = estimateEulerFromLandmarks(landmarks);
    headVector = [0, 0, 1];
  }

  return {
    pitch: euler.pitch,
    yaw: euler.yaw,
    roll: euler.roll,
    s_factor: slumpVal,
    norm_s: normS,
    head_vector: headVector,
  };
}

function estimateEulerFromLandmarks(landmarks: Landmark[]): HeadEuler {
  const nose = landmarks[PNP_INDICES[0]];
  const chin = landmarks[PNP_INDICES[1]];
  const leftEye = landmarks[PNP_INDICES[2]];
  const rightEye = landmarks[PNP_INDICES[3]];

  const yaw =
    Math.atan2(rightEye.x - leftEye.x, rightEye.z - leftEye.z + 0.001) * (180 / Math.PI);
  const pitch = Math.atan2(chin.y - nose.y, chin.z - nose.z + 0.001) * (180 / Math.PI);
  const roll =
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x + 0.001) * (180 / Math.PI);

  return { pitch, yaw, roll };
}

export function applyCalibration(
  metrics: FaceMetrics,
  offsets: { offset_pitch: number; offset_yaw: number; offset_s: number },
): {
  effective_pitch: number;
  effective_yaw: number;
  effective_s: number;
  head_vector: Vec3;
} {
  const effectivePitch = metrics.pitch - offsets.offset_pitch;
  const effectiveYaw = (metrics.yaw - offsets.offset_yaw) * YAW_SIGN;
  const effectiveS = metrics.norm_s - offsets.offset_s;
  const headVector: Vec3 = [
    metrics.head_vector[0] * YAW_SIGN,
    metrics.head_vector[1],
    metrics.head_vector[2],
  ];

  return {
    effective_pitch: effectivePitch,
    effective_yaw: effectiveYaw,
    effective_s: effectiveS,
    head_vector: headVector,
  };
}
