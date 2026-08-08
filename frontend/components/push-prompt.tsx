"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, X, BellRing } from "lucide-react";
import { useNotifications } from "@/lib/notifications-context";

const DISMISS_KEY = "anibinge:pushPromptDismissed";
const PROMPT_DELAY = 6000;

export function PushPrompt() {
  const { requestPermission, enablePush, pushPermission, pushEnabled } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (dismissed) return;
    if (pushPermission === "granted" || pushPermission === "denied" || pushPermission === "unsupported") return;

    const t = setTimeout(() => setVisible(true), PROMPT_DELAY);
    return () => clearTimeout(t);
  }, [pushPermission]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }, []);

  const onEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const perm = await requestPermission();
      if (perm !== "granted") {
        dismiss();
        return;
      }
      await enablePush();
      dismiss();
    } catch (e: any) {
      setError(e?.message || "Could not enable notifications right now. Try again later.");
    } finally {
      setBusy(false);
    }
  };

  if (!visible || pushEnabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm animate-[slideUp_0.25s_ease-out]">
      <div className="rounded-2xl border border-white/10 bg-surface-hi/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md">
        <button
          onClick={dismiss}
          aria-label="Dismiss notification prompt"
          className="absolute right-3 top-3 rounded-md p-1 text-mist transition-colors hover:text-paper"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600/20">
            <Bell className="h-4.5 w-4.5 text-primary-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-paper">Never miss new episodes</p>
            <p className="mt-0.5 text-xs leading-relaxed text-mist">
              Get notified when your favourite anime drops a new episode.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-400">{error}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onEnable}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:opacity-50"
          >
            <BellRing className="h-3.5 w-3.5" />
            {busy ? "Enabling..." : "Enable notifications"}
          </button>
          <button
            onClick={dismiss}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-mist transition hover:text-paper"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
