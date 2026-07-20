"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, WatchlistEntryData } from "@/lib/api";

const STATUSES: { value: WatchlistEntryData["status"]; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "planning", label: "Plan to Watch" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
  { value: "favorites", label: "Favorites" },
];

export function AddToWatchlistButton({ animeId, source }: { animeId: number; source: string }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<WatchlistEntryData["status"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getWatchlist(token)
      .then((res) => {
        const match = res.entries.find((e) => e.anime_id === animeId && e.source === source);
        setCurrent(match?.status ?? null);
      })
      .catch(() => {});
  }, [token, animeId, source]);

  if (!token) {
    return (
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-hi px-4 py-2 text-sm font-medium text-paper hover:bg-white/10"
      >
        <Plus className="h-4 w-4" />
        Sign in to add
      </Link>
    );
  }

  const setStatus = async (status: WatchlistEntryData["status"]) => {
    setBusy(true);
    setError(null);
    try {
      await api.upsertWatchlistEntry(token, { anime_id: animeId, source, status });
      setCurrent(status);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {current ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {current ? STATUSES.find((s) => s.value === current)?.label : "Add to Watchlist"}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-lg bg-surface-hi shadow-xl ring-1 ring-white/10">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className="block w-full px-4 py-2 text-left text-sm text-paper hover:bg-white/10"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
