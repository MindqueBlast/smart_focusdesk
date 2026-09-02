"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function AccountChip() {
  const { user, configured, loading } = useAuth();

  if (!configured || loading) return null;

  if (user) {
    const initial = (user.email?.[0] ?? "U").toUpperCase();
    return (
      <Link
        href="/settings"
        className="flex items-center gap-2 rounded-full border border-line/60 bg-panel/80 px-2 py-1 pr-3 text-xs hover:border-emerald/40"
        title={user.email ?? "Account"}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald/20 text-emerald">
          {initial}
        </span>
        <span className="hidden text-muted sm:inline">Synced</span>
      </Link>
    );
  }

  return (
    <Link
      href="/settings"
      className="rounded-lg px-3 py-2 text-sm text-muted hover:text-emerald"
    >
      Sign in
    </Link>
  );
}
