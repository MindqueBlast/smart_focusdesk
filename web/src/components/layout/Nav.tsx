"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
        <Link
          href="/session"
          className="rounded-xl bg-emerald/10 px-4 py-2 text-sm font-medium text-emerald hover:bg-emerald/20"
        >
          Start Session
        </Link>
      </div>
    </header>
  );
}
