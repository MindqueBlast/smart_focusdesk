"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Nav } from "@/components/layout/Nav";
import { Button } from "@/components/ui/Button";
import { CameraPanel } from "@/components/session/CameraPanel";
import { useCamera } from "@/hooks/useCamera";
import { loadSettings, saveSettings } from "@/lib/storage/db";
import type { AppSettings } from "@/types";

const STEPS = [
  {
    title: "Welcome to Smart Focus Desk",
    body: "A browser-based focus companion that tracks attention, gaze, and posture while you work.",
  },
  {
    title: "Your privacy comes first",
    body: "All webcam analysis runs locally in your browser. We never upload raw video — only derived focus metrics are stored on your device.",
  },
  {
    title: "Enable your camera",
    body: "We need camera access to analyze head pose, gaze, and posture. You can revoke this anytime in browser settings.",
  },
  {
    title: "Position yourself",
    body: "Sit arm's length from your screen. Keep your face centered and ensure good lighting.",
  },
  {
    title: "Quick calibration",
    body: "Stay still for 3 seconds while we capture your neutral pose. Press Continue when ready.",
  },
  {
    title: "Understanding Focus Score",
    body: "Your Focus Score (0–100) reflects gaze alignment, head orientation, posture, and sustained attention — smoothed to avoid flicker.",
  },
  {
    title: "You're all set",
    body: "Start your first focus session and watch your score respond to your attention in real time.",
  },
];

function cameraPanelStatus(
  cameraState: string,
  isPlaying: boolean,
): "idle" | "requesting" | "active" | "playing" | "error" {
  if (cameraState === "denied" || cameraState === "unavailable") return "error";
  if (cameraState === "requesting") return "requesting";
  if (isPlaying) return "playing";
  if (cameraState === "active") return "active";
  return "idle";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { setVideoRef, isVideoMounted, state, error, isPlaying, start } = useCamera();

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const current = STEPS[step];
  const showCamera = step >= 2;
  const panelStatus = cameraPanelStatus(state, isPlaying);

  const handleNext = async () => {
    if (step === 2 && state !== "active") {
      if (!isVideoMounted) return;
      await start();
      return;
    }

    if (step >= STEPS.length - 1) {
      if (settings) {
        await saveSettings({ ...settings, onboarding_complete: true });
      }
      router.push("/session");
      return;
    }

    setStep((s) => s + 1);
  };

  return (
    <>
      <Nav />
      <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center px-6 py-16">
        <div className="mb-8 flex gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-emerald" : "bg-line"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <h1 className="font-display text-3xl font-semibold md:text-4xl">{current.title}</h1>
            <p className="text-lg leading-relaxed text-muted">{current.body}</p>

            {showCamera && (
              <CameraPanel
                videoRef={setVideoRef}
                className="aspect-video w-full"
                status={panelStatus}
                overlay={
                  step === 3 ? (
                    <div className="rounded-xl border-2 border-dashed border-emerald/50 px-6 py-3 text-sm text-emerald">
                      Center your face here
                    </div>
                  ) : undefined
                }
              />
            )}

            {step === 2 && error && (
              <div className="rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson">
                {error}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex gap-4">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={step === 2 && state !== "active" && !isVideoMounted}>
            {step === 2 && state !== "active"
              ? "Allow Camera"
              : step === STEPS.length - 1
                ? "Start First Session"
                : "Continue"}
          </Button>
        </div>
      </main>
    </>
  );
}
