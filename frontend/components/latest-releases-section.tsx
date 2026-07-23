"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { LatestReleasesRow } from "@/components/latest-releases-row";
import type { GogoAnimeItem } from "@/lib/api";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function LatestReleasesSection() {
  const [items, setItems] = useState<GogoAnimeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = DAYS[new Date().getDay()];
    api
      .gogoanimeLatest(today)
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return <LatestReleasesRow items={items} loading={loading} />;
}
