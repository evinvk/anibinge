"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DISMISS_KEY = "anibinge_login_prompt_dismissed";

export function LoginPopup() {
  const { token, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  if (loading || token || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-void/80 px-4 pt-20 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
      <div className="glass-card w-full max-w-md animate-[slideUp_0.15s_ease-out] rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/20">
              <Sparkles className="h-4 w-4 text-primary-400" />
            </span>
            <h2 className="font-display text-lg font-bold text-paper">Sign in to Anibinge</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="rounded-md p-1 text-mist transition-colors hover:bg-white/10 hover:text-paper"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-mist">
          Create an account or sign in to track your watchlist, resume episodes where you left off,
          and get notified when your favorite shows release new episodes.
        </p>

        <div className="mt-5 space-y-2.5">
          <Link
            href="/login"
            className="block w-full rounded-full bg-primary-600 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-500"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="block w-full rounded-full border border-white/10 py-2.5 text-center text-sm font-medium text-paper transition hover:bg-white/5"
          >
            Create Account
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-full py-2 text-xs text-mist transition hover:text-paper"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
