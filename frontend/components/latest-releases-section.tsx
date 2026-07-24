"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { LatestReleasesRow } from "@/components/latest-releases-row";
import type { RecentEpisode } from "@/lib/api";

export function LatestReleasesSection() {
  const [items, setItems] = useState<RecentEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .recentEpisodes(20)
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return <LatestReleasesRow items={items} loading={loading} />;
}
