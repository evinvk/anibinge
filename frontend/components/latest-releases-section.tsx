"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { LatestReleasesRow } from "@/components/latest-releases-row";
import type { GogoAnimeItem } from "@/lib/api";

export function LatestReleasesSection() {
  const [items, setItems] = useState<GogoAnimeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .gogoanimeLatest()
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return <LatestReleasesRow items={items} loading={loading} />;
}
