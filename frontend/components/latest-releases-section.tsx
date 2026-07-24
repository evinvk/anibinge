"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { LatestReleasesRow } from "@/components/latest-releases-row";
import type { RecentEpisode } from "@/lib/api";

const PAGE_SIZE = 20;

export function LatestReleasesSection() {
  const [items, setItems] = useState<RecentEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        const res = await api.recentEpisodes(pageNum, PAGE_SIZE);
        setItems((prev) => (append ? [...prev, ...res.data] : res.data || []));
        setHasNext(res.has_next);
        setPage(pageNum);
      } catch {
        if (!append) setItems([]);
        setHasNext(false);
      }
    },
    [],
  );

  // Initial load
  useState(() => {
    fetchPage(1, false).finally(() => setLoading(false));
  });

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchPage(page + 1, true);
    setLoadingMore(false);
  };

  if (!loading && items.length === 0) return null;

  return (
    <LatestReleasesRow
      items={items}
      loading={loading}
      loadingMore={loadingMore}
      hasNext={hasNext}
      onLoadMore={loadMore}
    />
  );
}
