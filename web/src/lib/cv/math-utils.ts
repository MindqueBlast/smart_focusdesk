export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Landmark = { x: number; y: number; z: number };

export function finiteArray(values: number[], expectedLen?: number): number[] | null {
  if (!values || values.length === 0) return null;
  if (expectedLen !== undefined && values.length !== expectedLen) return null;
  if (!values.every((v) => Number.isFinite(v))) return null;
  return values;
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function projectToPlane2d(vec3: Vec3): Vec2 {
  const vz = vec3[2];
  if (Math.abs(vz) < 1e-6) return [0, 0];
  return [vec3[0] / vz, vec3[1] / vz];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function polygonArea(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area) / 2;
}

export function pointInPolygon(pt: Vec2, polygon: Vec2[]): { inside: boolean; dist: number } {
  if (polygon.length < 3) return { inside: false, dist: Infinity };

  const [x, y] = pt;
  let inside = false;
  let minDist = Infinity;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;

    const dx = xj - xi;
    const dy = yj - yi;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((x - xi) * dx + (y - yi) * dy) / lenSq : 0;
    t = clamp(t, 0, 1);
    const projX = xi + t * dx;
    const projY = yi + t * dy;
    const dist = Math.hypot(x - projX, y - projY);
    minDist = Math.min(minDist, dist);
  }

  const signedDist = inside ? minDist : -minDist;
  return { inside, dist: signedDist };
}

export function extractEulerFromMatrix(matrix: Float32Array | number[]): HeadEuler {
  const m = matrix;
  const sy = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
  const singular = sy < 1e-6;

  let pitch: number;
  let yaw: number;
  let roll: number;

  if (!singular) {
    pitch = Math.atan2(m[6], m[10]) * (180 / Math.PI);
    yaw = Math.atan2(-m[2], sy) * (180 / Math.PI);
    roll = Math.atan2(m[1], m[0]) * (180 / Math.PI);
  } else {
    pitch = Math.atan2(-m[9], m[5]) * (180 / Math.PI);
    yaw = Math.atan2(-m[2], sy) * (180 / Math.PI);
    roll = 0;
  }

  pitch = pitch > 0 ? pitch - 180 : pitch + 180;

  return { pitch, yaw, roll };
}

export interface HeadEuler {
  pitch: number;
  yaw: number;
  roll: number;
}

export function headVectorFromMatrix(matrix: Float32Array | number[]): Vec3 {
  return [matrix[8] ?? 0, matrix[9] ?? 0, matrix[10] ?? 1];
}
