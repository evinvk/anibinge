"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { ManhwaLatestRow } from "@/components/manhwa-latest-row";
import type { ManhwaItem } from "@/lib/api";

export function ManhwaLatestSection() {
  const [items, setItems] = useState<ManhwaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .manhwaLatest(1)
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return <ManhwaLatestRow items={items} loading={loading} />;
}
