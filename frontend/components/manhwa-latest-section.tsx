"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { ManhwaLatestRow } from "@/components/manhwa-latest-row";

const PAGE_SIZE = 20;

export function ManhwaLatestSection() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        const res = await api.manhwaLatest(pageNum);
        setItems((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
        setHasNext((res.data || []).length === PAGE_SIZE);
        setPage(pageNum);
      } catch {
        if (!append) setItems([]);
        setHasNext(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchPage(1, false).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchPage(page + 1, true);
    setLoadingMore(false);
  };

  if (!loading && items.length === 0) return null;

  return (
    <ManhwaLatestRow
      items={items}
      loading={loading}
      loadingMore={loadingMore}
      hasNext={hasNext}
      onLoadMore={loadMore}
    />
  );
}
