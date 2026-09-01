"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { searchAnimeClient } from "@/lib/anilist-client";
import type { AnimeSummary } from "@/lib/api";

interface GenreGridProps {
  genre: string;
}

export function GenreGrid({ genre }: GenreGridProps) {
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchAnimeClient({ query: "anime", genres: genre, orderBy: "popularity", sort: "desc", perPage: 60 })
      .then((res) => {
        if (!cancelled) setItems(res);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [genre]);

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 py-16 text-mist">
        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
        <span className="text-sm">Loading titles…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="mt-8 text-mist">
        We&apos;re refreshing titles in this genre. Check back soon or{" "}
        <a href="/browse" className="text-primary-400 hover:underline">
          browse the full catalog
        </a>
        .
      </p>
    );
  }

  return (
    <AnimeGrid className="mt-4">
      {items.map((a) => (
        <AnimeCard key={a.id} anime={a} />
      ))}
    </AnimeGrid>
  );
}
