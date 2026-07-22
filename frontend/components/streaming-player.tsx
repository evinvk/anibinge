"use client";

import { useState, useEffect } from "react";
import { Play, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface SearchResult {
  slug: string;
  title: string;
  poster: string | null;
  episodes_count: number | null;
  score: string | null;
  type: string | null;
}

interface StreamingPlayerProps {
  animeTitle: string;
}

export function StreamingPlayer({ animeTitle }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchAnime();
  }, [animeTitle]);

  useEffect(() => {
    if (selectedSlug) {
      setCurrentEp(1);
      const match = results.find((r) => r.slug === selectedSlug);
      if (match?.episodes_count) {
        setTotalEps(match.episodes_count);
      }
    }
  }, [selectedSlug]);

  async function searchAnime() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.gogoanimeSearch(animeTitle);
      setResults(res.data || []);
      if (res.data?.length > 0) {
        setSelectedSlug(res.data[0].slug);
        setTotalEps(res.data[0].episodes_count || null);
      }
    } catch {
      setError("Failed to search GogoAnime");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Searching for streaming sources...</span>
      </div>
    );
  }

  if (error && results.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (results.length === 0 && !loading) {
    return null;
  }

  const watchUrl = selectedSlug
    ? `https://gogoanimehd.to/watch/${selectedSlug}/ep-${currentEp}`
    : null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Play className="h-5 w-5 text-primary-400" />
        <h2 className="font-display text-xl font-bold">Watch</h2>
        <span className="text-xs text-mist">via GogoAnime</span>
      </div>

      {/* Server selector if multiple results */}
      {results.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {results.slice(0, 5).map((r) => (
            <button
              key={r.slug}
              onClick={() => setSelectedSlug(r.slug)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                selectedSlug === r.slug
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              {r.title}
            </button>
          ))}
        </div>
      )}

      {/* Iframe player */}
      {watchUrl && (
        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={watchUrl}
            allowFullScreen
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Episode navigation */}
      {totalEps && totalEps > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setCurrentEp((p) => Math.max(1, p - 1))}
            disabled={currentEp <= 1}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp <= 1
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </button>
          <span className="text-sm font-mono text-mist">
            Ep {currentEp} / {totalEps}
          </span>
          <button
            onClick={() => setCurrentEp((p) => Math.min(totalEps, p + 1))}
            disabled={currentEp >= totalEps}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp >= totalEps
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </section>
  );
}
