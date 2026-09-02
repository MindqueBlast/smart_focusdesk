"use client";

import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/storage/db";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => setReduced(s.reduced_motion));
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}
