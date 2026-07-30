"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { SeasonTabs } from "@/components/season-tabs";
import type { AnimeSummary } from "@/lib/api";

const SEASONS = ["winter", "spring", "summer", "fall"] as const;

function currentSeasonInfo() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const season = month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : month <= 11 ? "fall" : "winter";
  return { year, season };
}

interface Props {
  year?: string;
  season?: string;
}

export function SeasonalContent({ year: yearParam, season: seasonParam }: Props) {
  const fallback = currentSeasonInfo();
  const year = Number(yearParam) || fallback.year;
  const season = (seasonParam as (typeof SEASONS)[number]) || fallback.season;

  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeason = useCallback(async (y: number, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/seasonal/${y}/${s}?page=1`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Failed to load: ${res.status}${body.error ? ` — ${body.error}` : ""}`);
      }
      const json = await res.json();
      setItems(json.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load seasonal anime");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeason(year, season);
  }, [year, season, fetchSeason]);

  return (
    <>
      <SeasonTabs currentYear={year} currentSeason={season} seasons={SEASONS} />

      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {[...Array(18)].map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-8 text-center">
          <p className="text-lg font-medium text-red-400">Failed to load seasonal anime</p>
          <p className="text-sm text-mist">{error}</p>
          <button
            onClick={() => fetchSeason(year, season)}
            className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-lg font-medium">No anime found for {season} {year}</p>
          <p className="text-sm text-mist">Try a different season or year.</p>
        </div>
      ) : (
        <AnimeGrid className="mt-8">
          {items.map((item) => (
            <AnimeCard key={item.id} anime={item} />
          ))}
        </AnimeGrid>
      )}
    </>
  );
}
