"use client";

import { useCallback, useEffect, useRef } from "react";
import { INFERENCE_TARGET_FPS } from "@/lib/cv/constants";

export function useFrameLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: (bitmap: ImageBitmap, timestamp: number) => void,
) {
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const tick = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const now = performance.now();
    const minInterval = 1000 / INFERENCE_TARGET_FPS;

    if (now - lastFrameRef.current >= minInterval) {
      lastFrameRef.current = now;
      createImageBitmap(video)
        .then((bitmap) => onFrameRef.current(bitmap, now))
        .catch(() => {});
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, tick]);
}
