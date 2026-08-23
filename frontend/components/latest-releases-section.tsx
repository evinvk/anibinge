"use client";

import { useState, useEffect } from "react";
import { LatestReleasesRow } from "@/components/latest-releases-row";
import type { RecentEpisode } from "@/lib/api";

const ANILIST_GQL = "https://graphql.anilist.co";

const AIRING_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(type:ANIME,countryOfOrigin:JP,status:RELEASING,sort:POPULARITY_DESC){
      id idMal
      title{english romaji native}
      coverImage{large}
      genres format
      nextAiringEpisode{airingAt episode timeUntilAiring}
    }
  }
}`;

function normalizeAiringItem(m: any): RecentEpisode | null {
  const next = m.nextAiringEpisode;
  if (!next?.airingAt) return null;

  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const lastAiredAt = next.airingAt - SEVEN_DAYS;
  const now = Math.floor(Date.now() / 1000);
  const airedAgo = now - lastAiredAt;

  if (airedAgo < 0 || airedAgo > SEVEN_DAYS * 2) return null;

  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  const epNum = Math.max(1, next.episode - 1);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return {
    title,
    episode: epNum,
    poster: m.coverImage?.large || null,
    slug,
    aired_ago: airedAgo,
    genres: (m.genres || []).slice(0, 2),
    anilist_id: m.idMal || m.id,
  };
}

export function LatestReleasesSection() {
  const [items, setItems] = useState<RecentEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const all: RecentEpisode[] = [];
        for (let pg = 1; pg <= 3; pg++) {
          const resp = await fetch(ANILIST_GQL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: AIRING_QUERY, variables: { page: pg, perPage: 50 } }),
          });
          if (!resp.ok) break;
          const data = await resp.json();
          const media = data?.data?.Page?.media || [];
          for (const m of media) {
            const item = normalizeAiringItem(m);
            if (item) all.push(item);
          }
        }
        all.sort((a, b) => a.aired_ago - b.aired_ago);
        setItems(all.slice(0, 40));
      } catch {
        setItems([]);
      }
      setLoading(false);
    })();
  }, []);

  const loadMore = () => {
    setPage((p) => p + 1);
  };

  if (!loading && items.length === 0) return null;

  return (
    <LatestReleasesRow
      items={items.slice(0, page * 20)}
      loading={loading}
      loadingMore={false}
      hasNext={items.length > page * 20}
      onLoadMore={loadMore}
    />
  );
}
