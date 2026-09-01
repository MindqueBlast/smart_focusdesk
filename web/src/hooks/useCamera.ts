"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type CameraState =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "disconnected";

function hasVideoFrames(video: HTMLVideoElement) {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attachTokenRef = useRef(0);
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoMounted, setIsVideoMounted] = useState(false);

  const attachStream = useCallback(async (video: HTMLVideoElement) => {
    const stream = streamRef.current;
    if (!stream) return false;

    const token = ++attachTokenRef.current;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const markPlaying = () => {
      if (token !== attachTokenRef.current) return;
      if (hasVideoFrames(video) && !video.paused) {
        setIsPlaying(true);
      }
    };

    video.onloadedmetadata = markPlaying;
    video.onloadeddata = markPlaying;
    video.oncanplay = markPlaying;
    video.onplaying = () => {
      if (token === attachTokenRef.current) setIsPlaying(true);
    };

    try {
      await video.play();
    } catch {
      // Autoplay may fail until metadata arrives; events below will retry play().
    }

    markPlaying();

    // Poll briefly — some browsers attach the stream without firing loadedmetadata promptly.
    for (let i = 0; i < 30; i += 1) {
      if (token !== attachTokenRef.current) return false;
      if (hasVideoFrames(video)) {
        if (video.paused) {
          try {
            await video.play();
          } catch {
            // ignore
          }
        }
        markPlaying();
        if (!video.paused) return true;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }

    return hasVideoFrames(video) && !video.paused;
  }, []);

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      setIsVideoMounted(Boolean(node));
      if (node && streamRef.current) {
        void attachStream(node);
      }
    },
    [attachStream],
  );

  useLayoutEffect(() => {
    if (state === "active" && videoRef.current && streamRef.current) {
      void attachStream(videoRef.current);
    }
  }, [state, isVideoMounted, attachStream]);

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
    attachTokenRef.current += 1;
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
    isVideoMounted,
    state,
    error,
    isPlaying,
    start,
    stop,
  };
}
