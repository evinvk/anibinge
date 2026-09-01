"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AnimeCard, AnimeCardSkeleton, AnimeGrid } from "@/components/anime-card";
import type { AnimeSummary } from "@/lib/api";
import { searchAnimeClient } from "@/lib/anilist-client";

interface InfiniteAnimeGridProps {
  initialItems: AnimeSummary[];
  query: string;
  filters: Record<string, string>;
}

export function InfiniteAnimeGrid({ initialItems, query, filters }: InfiniteAnimeGridProps) {
  const [items, setItems] = useState<AnimeSummary[]>(initialItems);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    setItems(initialItems);
    setPage(initialItems.length > 0 ? 1 : 0);
    setHasMore(true);
    initialLoadDoneRef.current = false;
  }, [initialItems, query, filtersKey]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const nextPage = page + 1;
      const newItems: AnimeSummary[] = await searchAnimeClient({
        query,
        page: nextPage,
        genres: filters.genres,
        status: filters.status,
        type: filters.type,
        orderBy: filters.order_by,
        sort: filters.sort,
        year: filters.year,
        season: filters.season,
      });

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

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    if (initialItems.length === 0 && !initialLoadDoneRef.current && !loading) {
      initialLoadDoneRef.current = true;
      loadMoreRef.current();
    }
  }, [initialItems, loading]);

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
