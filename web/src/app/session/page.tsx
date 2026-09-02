"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { loadSettings } from "@/lib/storage/db";

const SessionView = dynamic(() => import("@/components/session/SessionView"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-page text-muted">
      Loading focus session...
    </div>
  ),
});

export default function SessionPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      if (!s.onboarding_complete) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-muted">
        Loading focus session...
      </div>
    );
  }

  return <SessionView />;
}
