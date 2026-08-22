"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { needsUnoptimized, hasValidImageUrl } from "@/lib/utils";
import { ScheduleGrid } from "@/components/schedule-grid";
import type { AnimeSummary } from "@/lib/api";

const ANILIST_GQL = "https://graphql.anilist.co";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const SCHEDULE_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(type:ANIME,countryOfOrigin:JP,status:RELEASING,sort:POPULARITY_DESC){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres
      nextAiringEpisode{airingAt timeUntilAiring episode}
      season seasonYear format
      startDate{year month day}
      description
    }
  }
}`;

const UPCOMING_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(type:ANIME,countryOfOrigin:JP,status:NOT_YET_RELEASED,sort:POPULARITY_DESC){
      id idMal title{english romaji native}
      coverImage{large}
      averageScore popularity episodes status genres
      startDate{year month day}
      season seasonYear format
    }
  }
}`;

async function fetchAnilist<T = any>(query: string, variables: Record<string, any>): Promise<T> {
  const resp = await fetch(ANILIST_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`AniList ${resp.status}`);
  return resp.json();
}

function normalizeMedia(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  const nextEp = m.nextAiringEpisode || {};
  let airTime = null;
  let day = null;
  if (nextEp.airingAt) {
    const dt = new Date(nextEp.airingAt * 1000);
    airTime = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    day = DAYS[dt.getDay()];
  }
  return {
    id: m.idMal || m.id,
    source: m.idMal ? "mal" : "anilist",
    title,
    title_english: m.title?.english || null,
    image: m.coverImage?.large || null,
    banner: m.bannerImage || null,
    score: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity || null,
    episodes: m.episodes || null,
    status: m.status || null,
    genres: m.genres || [],
    synopsis: m.description?.replace(/<[^>]*>/g, "")?.slice(0, 500) || null,
    year: m.seasonYear || m.startDate?.year || null,
    season: m.season || null,
    format: m.format || null,
    start_date: m.startDate ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
    air_time: airTime,
    next_episode: nextEp.episode || null,
    airing_at: nextEp.airingAt || null,
  };
}

export default function SchedulePage() {
  const [weekly, setWeekly] = useState<Record<string, any>>({});
  const [upcoming, setUpcoming] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const grouped: Record<string, any[]> = {};
        for (const d of DAYS) grouped[d] = [];
        for (let pg = 1; pg <= 3; pg++) {
          const data = await fetchAnilist(SCHEDULE_QUERY, { page: pg, perPage: 50 });
          const media = data?.data?.Page?.media || [];
          for (const m of media) {
            if (!m.nextAiringEpisode?.airingAt) continue;
            const item = normalizeMedia(m);
            const dt = new Date(m.nextAiringEpisode.airingAt * 1000);
            const day = DAYS[dt.getDay()];
            grouped[day].push(item);
          }
        }
        const result: Record<string, { data: any[] }> = {};
        for (const [day, items] of Object.entries(grouped)) {
          result[day] = { data: items };
        }
        setWeekly(result);
      } catch {
        setWeekly({});
      }
      try {
        const data = await fetchAnilist(UPCOMING_QUERY, { page: 1, perPage: 30 });
        const media = data?.data?.Page?.media || [];
        setUpcoming(media.map(normalizeMedia));
      } catch {
        setUpcoming([]);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Weekly Schedule</h1>
      <p className="mt-1 text-mist">Air times shown in your local timezone.</p>
      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <ScheduleGrid data={weekly} />
      )}

      {upcoming.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold">Coming Soon</h2>
          <p className="mt-1 text-sm text-mist">Anime releasing in the near future.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {upcoming.slice(0, 18).map((anime) => (
              <Link
                key={anime.id}
                href={anime.source === "anilist" ? `/anime/${anime.id}?source=anilist` : `/anime/${anime.id}`}
                className="group"
              >
                <div className="glass-card overflow-hidden">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl2">
                    {hasValidImageUrl(anime.image) ? (
                      <Image
                        src={anime.image}
                        alt={anime.title_english || anime.title}
                        fill
                        loading="lazy"
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        unoptimized={needsUnoptimized(anime.image)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-surface-hi">
                        <span className="text-2xl font-bold text-mist/40">{(anime.title_english || anime.title)?.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
                      {anime.title_english || anime.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-mist">
                      {anime.start_date
                        ? new Date(anime.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                        : "TBA"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
