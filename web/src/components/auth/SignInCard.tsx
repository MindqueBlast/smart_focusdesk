"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface SignInCardProps {
  variant?: "default" | "compact";
  className?: string;
}

export function SignInCard({ variant = "default", className }: SignInCardProps) {
  const { user, configured, signIn, loading } = useAuth();

  if (!configured || user || loading) return null;

  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-emerald/20 bg-gradient-to-br from-emerald/10 via-panel to-panel p-6",
        className,
      )}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald/10 blur-2xl" />
      <h3 className={cn("font-display font-semibold", compact ? "text-lg" : "text-xl")}>
        Save your focus journey
      </h3>
      <p className="mt-2 text-sm text-muted">
        Sign in with Google to sync sessions across devices, track streaks, and unlock personalized
        insights.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-muted">
        <li>• Cross-device session history</li>
        <li>• Streak and goal tracking</li>
        <li>• Personalized focus recommendations</li>
      </ul>
      <Button
        className="mt-5"
        variant="secondary"
        onClick={() => signIn()}
      >
        Continue with Google
      </Button>
    </div>
  );
}
