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
  const [isPlaying, setIsPlaying] = useState(false);

  const attachStream = useCallback(async (video: HTMLVideoElement) => {
    const stream = streamRef.current;
    if (!stream) return false;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    try {
      await video.play();
      setIsPlaying(true);
      return true;
    } catch {
      setIsPlaying(false);
      return false;
    }
  }, []);

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && streamRef.current) {
        void attachStream(node);
      }
    },
    [attachStream],
  );

  // Re-attach when stream becomes available after the video element mounts.
  useEffect(() => {
    if (state === "active" && videoRef.current && streamRef.current) {
      void attachStream(videoRef.current);
    }
  }, [state, attachStream]);

  const start = useCallback(async () => {
    if (streamRef.current) {
      setState("active");
      if (videoRef.current) {
        await attachStream(videoRef.current);
      }
      return streamRef.current;
    }

    setState("requesting");
    setError(null);
    setIsPlaying(false);

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

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setState("disconnected");
        setIsPlaying(false);
        setError("Camera disconnected.");
      });

      setState("active");

      if (videoRef.current) {
        await attachStream(videoRef.current);
      }

      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Camera access failed";
      if (
        message.toLowerCase().includes("denied") ||
        message.toLowerCase().includes("permission")
      ) {
        setState("denied");
        setError("Camera permission denied. Enable it in browser settings.");
      } else {
        setState("unavailable");
        setError(message);
      }
      return null;
    }
  }, [attachStream]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsPlaying(false);
    setState("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    setVideoRef,
    state,
    error,
    isPlaying,
    start,
    stop,
  };
}
