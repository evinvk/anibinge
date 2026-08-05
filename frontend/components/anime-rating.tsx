"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import clsx from "clsx";

interface RatingState {
  average: number;
  count: number;
  my_rating: number | null;
}

export function AnimeRating({ animeId, source }: { animeId: number; source: string }) {
  const { token } = useAuth();
  const [state, setState] = useState<RatingState | null>(null);
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/ratings?anime_id=${animeId}&source=${source}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setState(json); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [animeId, source]);

  const rate = async (value: number) => {
    if (!token) {
      setError("Log in to rate this anime");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ anime_id: animeId, source, rating: value }),
      });
      if (!res.ok) throw new Error("Failed to save rating");
      const json = await res.json();
      setState(json);
    } catch {
      setError("Couldn't save your rating — try again");
    } finally {
      setSaving(false);
    }
  };

  const clearRating = async () => {
    if (!token || state?.my_rating == null) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/ratings?anime_id=${animeId}&source=${source}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      setState(await res.json());
    } catch {
      setError("Couldn't remove your rating");
    } finally {
      setSaving(false);
    }
  };

  const active = hover || state?.my_rating || 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface-hi px-4 py-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            disabled={saving}
            onClick={() => rate(v)}
            onMouseEnter={() => setHover(v)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${v} out of 10`}
            className="p-0.5 transition-transform hover:scale-125 disabled:opacity-50"
          >
            <Star
              className={clsx(
                "h-4 w-4 transition-colors",
                v <= active ? "fill-amber-400 text-amber-400" : "text-white/25"
              )}
            />
          </button>
        ))}
      </div>
      <div className="text-sm">
        {state?.count ? (
          <>
            <span className="font-mono font-bold text-paper">{state.average.toFixed(1)}</span>
            <span className="text-mist"> / 10</span>
            <span className="ml-1.5 text-xs text-mist">({state.count} {state.count === 1 ? "rating" : "ratings"})</span>
          </>
        ) : (
          <span className="text-xs text-mist">Be the first to rate</span>
        )}
        {state?.my_rating != null && (
          <button onClick={clearRating} className="ml-2 text-xs text-mist underline-offset-2 hover:text-paper hover:underline" disabled={saving}>
            Remove my rating
          </button>
        )}
      </div>
      {error && <span className="text-xs text-amber-400">{error}</span>}
    </div>
  );
}
