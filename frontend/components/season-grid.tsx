"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AnimeCard, AnimeGrid, AnimeCardSkeleton } from "@/components/anime-card";
import type { AnimeSummary } from "@/lib/api";
import { fetchSeasonal } from "@/lib/anilist-client";

interface SeasonGridProps {
  year: number;
  season: string;
}

export function SeasonGrid({ year, season }: SeasonGridProps) {
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeason = useCallback(async (y: number, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await fetchSeasonal(y, s, 1, 30);
      setItems(results);
    } catch (err: any) {
      setError(err.message || "Failed to load seasonal anime");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeason(year, season);
  }, [year, season, fetchSeason]);

  if (loading) {
    return (
      <AnimeGrid className="mt-8">
        {Array.from({ length: 18 }).map((_, i) => (
          <AnimeCardSkeleton key={i} />
        ))}
      </AnimeGrid>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-lg font-medium">No anime found for {season} {year}</p>
        <p className="text-sm text-mist">
          Try a different season or <Link href="/browse" className="text-primary-400 hover:underline">browse the full catalog</Link>.
        </p>
      </div>
    );
  }

  return (
    <AnimeGrid className="mt-8">
      {items.map((item) => (
        <AnimeCard key={item.id} anime={item} />
      ))}
    </AnimeGrid>
  );
}