"use client";

import { motion, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

interface AnimatedScoreProps {
  value: number;
  label: string;
  size?: "lg" | "md";
}

export function AnimatedScore({ value, label, size = "lg" }: AnimatedScoreProps) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    spring.set(value);
    const unsub = spring.on("change", (v) => setDisplay(Math.round(v).toString()));
    return unsub;
  }, [value, spring]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      <motion.span
        className={`font-display font-semibold tabular-nums ${
          size === "lg" ? "text-6xl md:text-7xl" : "text-3xl"
        } text-emerald`}
      >
        {display}
      </motion.span>
    </div>
  );
}
