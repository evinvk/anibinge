"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimeCard, AnimeCardSkeleton, AnimeGrid } from "@/components/anime-card";
import type { AnimeSummary } from "@/lib/api";

interface InfiniteAnimeGridProps {
  initialItems: AnimeSummary[];
  query: string;
  filters: Record<string, string>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function InfiniteAnimeGrid({ initialItems, query, filters }: InfiniteAnimeGridProps) {
  const [items, setItems] = useState<AnimeSummary[]>(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems.length > 0);
  const [isVisible, setIsVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initialItems);
    setPage(1);
    setHasMore(initialItems.length > 0);
  }, [initialItems, query, JSON.stringify(filters)]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const qs = new URLSearchParams({ q: query, page: String(nextPage), ...filters });
      const res = await fetch(`${API_BASE}/api/v1/search?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = await res.json();
      const newItems: AnimeSummary[] = json.data ?? [];

      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...prev, ...newItems]);
        setPage(nextPage);
      }
    } catch (err) {
      console.error("Failed to load more anime:", err);
    } finally {
      setLoading(false);
    }
  }, [page, query, filters]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => setIsVisible(entries[0].isIntersecting),
      { rootMargin: "600px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || loading || !hasMore) return;
    const timer = setTimeout(() => loadMore(), 400);
    return () => clearTimeout(timer);
  }, [isVisible, loading, hasMore, loadMore]);

  return (
    <>
      <AnimeGrid className="mt-8">
        {items.map((anime, i) => (
          <AnimeCard key={`${anime.id}-${i}`} anime={anime} />
        ))}
        {loading &&
          Array.from({ length: 6 }).map((_, i) => <AnimeCardSkeleton key={`skeleton-${i}`} />)}
      </AnimeGrid>

      <div ref={sentinelRef} className="h-1" />

      {!hasMore && items.length > 0 && (
        <p className="mt-10 text-center text-sm text-mist">
          You've reached the end — {items.length} titles loaded.
        </p>
      )}
    </>
  );
}
