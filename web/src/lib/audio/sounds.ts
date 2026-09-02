let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freq: number, duration: number, volume = 0.08, type: OscillatorType = "sine") {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

export function playDistractionNudge() {
  tone(440, 0.12, 0.06);
}

export function playCalibrationComplete() {
  tone(523, 0.1, 0.07);
  setTimeout(() => tone(659, 0.15, 0.07), 100);
}

export function playSessionEnd() {
  tone(392, 0.12, 0.06);
  setTimeout(() => tone(523, 0.2, 0.06), 120);
}

export function playGoalReached() {
  tone(523, 0.1, 0.07);
  setTimeout(() => tone(659, 0.1, 0.07), 100);
  setTimeout(() => tone(784, 0.2, 0.07), 200);
}
