"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountChip } from "@/components/auth/AccountChip";
import { loadSettings } from "@/lib/storage/db";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/session", label: "Focus" },
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionHref, setSessionHref] = useState("/onboarding");

  useEffect(() => {
    loadSettings().then((s) => {
      setSessionHref(s.onboarding_complete ? "/session" : "/onboarding");
    });
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-page/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          Smart<span className="text-emerald">Focus</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors",
                pathname === link.href
                  ? "bg-panel-2 text-emerald"
                  : "text-muted hover:text-text",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <AccountChip />
          <Link
            href={sessionHref}
            className="hidden rounded-xl bg-emerald/10 px-4 py-2 text-sm font-medium text-emerald hover:bg-emerald/20 sm:inline-flex"
          >
            Start Session
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-muted md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-line/60 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  pathname === link.href ? "bg-panel-2 text-emerald" : "text-muted",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={sessionHref}
              onClick={() => setMenuOpen(false)}
              className="mt-2 rounded-xl bg-emerald/10 px-4 py-2 text-center text-sm font-medium text-emerald"
            >
              Start Session
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
