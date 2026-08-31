import Link from "next/link";
import { Nav } from "@/components/layout/Nav";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <section className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(22,243,162,0.12),transparent)]" />
          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-emerald/80">
            Privacy-first focus intelligence
          </p>
          <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            AI-powered focus tracking through your webcam.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Smart Focus Desk analyzes attention, gaze, and posture in real time — entirely in your
            browser. No video uploads. Just meaningful focus feedback and session analytics.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button href="/onboarding" size="lg">
              Start Focus Session
            </Button>
            <Button href="/history" variant="secondary" size="lg">
              View History
            </Button>
          </div>
        </section>

        <section className="border-y border-line/60 bg-panel/30 py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Grant camera access",
                body: "Your webcam feed stays on your device. We never upload raw video.",
              },
              {
                step: "02",
                title: "Calibrate in seconds",
                title2: "",
                body: "A quick neutral-pose or corner calibration tunes tracking to your setup.",
              },
              {
                step: "03",
                title: "Focus with live feedback",
                body: "See your Focus Score, posture state, and distraction patterns in real time.",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-3">
                <span className="font-display text-3xl text-emerald/40">{item.step}</span>
                <h3 className="font-display text-xl font-medium">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold">Built for privacy</h2>
              <p className="mt-4 text-muted leading-relaxed">
                Camera frames are processed locally using MediaPipe. Only derived metrics — focus
                scores, gaze direction, posture state, timestamps — are stored on your device.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted">
                <li>• No raw webcam footage stored or uploaded</li>
                <li>• Local IndexedDB session history</li>
                <li>• Optional cloud sync only for signed-in users</li>
              </ul>
            </div>
            <div className="glass rounded-3xl p-8">
              <div className="space-y-6">
                <FeatureRow label="Real-time Focus Score" value="0–100" />
                <FeatureRow label="Posture & gaze tracking" value="Live" />
                <FeatureRow label="Session analytics" value="Timeline + insights" />
                <FeatureRow label="Distraction detection" value="Smart debouncing" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line/60 bg-panel/20 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold">Ready to focus?</h2>
          <p className="mt-3 text-muted">Open the app, calibrate once, and start your first session.</p>
          <div className="mt-8">
            <Button href="/onboarding" size="lg">
              Get Started
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/50 pb-4 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-emerald">{value}</span>
    </div>
  );
}
