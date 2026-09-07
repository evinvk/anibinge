"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Languages, Loader2 } from "lucide-react";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { HINDI_ANIME } from "@/lib/hindi-seo";
import { needsUnoptimized } from "@/lib/utils";
import type { AnimeSummary } from "@/lib/api";

const SITE_URL = "https://www.anibinge.fun";
const ANILIST_GQL = "https://graphql.anilist.co";

const MEDIA_QUERY = `query($ids:[Int]){
  Page(page:1,perPage:50){
    media(id_in:$ids,type:ANIME,countryOfOrigin:JP){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres description
      startDate{year month day} season format
    }
  }
}`;

function normalizeMedia(m: any): AnimeSummary {
  return {
    id: m.idMal || m.id,
    source: "anilist",
    title: m.title?.english || m.title?.romaji || "",
    title_english: m.title?.english || null,
    image: m.coverImage?.large || null,
    banner: m.bannerImage || null,
    score: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity || null,
    episodes: m.episodes || null,
    status: m.status || null,
    genres: m.genres || [],
    synopsis: m.description?.replace(/<[^>]*>/g, "")?.slice(0, 500) || null,
    year: m.startDate?.year || null,
    season: m.season || null,
    format: m.format || null,
    start_date: m.startDate
      ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}`
      : null,
  };
}

export function HindiAnimeGrid() {
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = HINDI_ANIME.map((h) => h.anilistId);
    fetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: MEDIA_QUERY, variables: { ids } }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const media = data?.data?.Page?.media || [];
        setItems(media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 text-mist">
        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
        Loading Hindi dubbed anime...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="mt-8 text-mist">
        We&apos;re refreshing the Hindi catalog. Check back soon or{" "}
        <Link href="/browse" className="text-primary-400 hover:underline">
          browse the full catalog
        </Link>.
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
