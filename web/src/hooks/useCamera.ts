"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "disconnected";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setState("requesting");
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        setError("Camera API not supported in this browser.");
        return null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setState("disconnected");
        setError("Camera disconnected.");
      });

      setState("active");
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Camera access failed";
      if (message.toLowerCase().includes("denied") || message.toLowerCase().includes("permission")) {
        setState("denied");
        setError("Camera permission denied. Enable it in browser settings.");
      } else {
        setState("unavailable");
        setError(message);
      }
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, state, error, start, stop };
}
