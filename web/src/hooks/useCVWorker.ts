"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FrameMetrics, TrackingMode } from "@/types";
import type { WorkerInMessage, WorkerOutMessage } from "@/workers/cv-worker";

export type CVWorkerState =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export function useCVWorker(onMetrics: (metrics: FrameMetrics) => void) {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<CVWorkerState>("idle");
  const [loadMessage, setLoadMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;

  const init = useCallback(async () => {
    if (workerRef.current) return;

    setState("loading");
    setError(null);

    const worker = new Worker(new URL("../workers/cv-worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          setState("ready");
          break;
        case "init_progress":
          setLoadMessage(msg.message);
          break;
        case "metrics":
          onMetricsRef.current(msg.data);
          break;
        case "error":
          setState("error");
          setError(msg.message);
          break;
      }
    };

    worker.onerror = () => {
      setState("error");
      setError("CV worker crashed");
    };

    const modelUrl =
      process.env.NEXT_PUBLIC_FACE_LANDMARKER_MODEL_URL ??
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    worker.postMessage({ type: "init", modelUrl } satisfies WorkerInMessage);
  }, []);

  const sendFrame = useCallback((bitmap: ImageBitmap, timestamp: number) => {
    workerRef.current?.postMessage(
      { type: "frame", bitmap, timestamp } satisfies WorkerInMessage,
      [bitmap],
    );
  }, []);

  const post = useCallback((msg: WorkerInMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return {
    state,
    loadMessage,
    error,
    init,
    sendFrame,
    setTrackingMode: (mode: TrackingMode) => post({ type: "set_tracking_mode", mode }),
    startCalibration: () => post({ type: "start_calibration" }),
    setSensitivity: (value: number) => post({ type: "set_sensitivity", value }),
    sessionStart: () => post({ type: "session_start" }),
    sessionStop: () => post({ type: "session_stop" }),
  };
}
