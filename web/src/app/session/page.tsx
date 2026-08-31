"use client";

import dynamic from "next/dynamic";

const SessionView = dynamic(() => import("@/components/session/SessionView"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-page text-muted">
      Loading focus session...
    </div>
  ),
});

export default function SessionPage() {
  return <SessionView />;
}
