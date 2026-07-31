"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { AddToWatchlistButton } from "@/components/add-to-watchlist-button";
import { DownloadButton } from "@/components/download-button";
import { LazyStreamingPlayer } from "@/components/lazy-streaming-player";
import { FaqSection } from "@/components/faq-section";
import { findGenreByName } from "@/lib/genre-seo";

export function AnimeDetailClient({ id, source = "mal" }: { id: string; source?: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [characters, setCharacters] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const malId = Number(id);

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      api.detail(malId, source),
      api.characters(malId).catch(() => ({ data: [] })),
      api.recommendations(malId).catch(() => ({ data: [] })),
    ])
      .then(([detailRes, charsRes, recsRes]) => {
        setDetail(detailRes.data);
        setCharacters(charsRes.data || []);
        setRecommendations(recsRes.data || []);
        setLoading(false);
        fetch("/api/v1/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: malId }),
        }).catch(() => {});
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          notFound();
        } else {
          setError(true);
          setLoading(false);
        }
      });
  }, [id, source, malId]);

  const displayTitle = detail?.title_english || detail?.title || "This anime";
  const faqItems = useMemo(() => {
    if (!detail) return [];
    const items = [];
    const finished = /finished/i.test(detail.status || "");
    const airing = /currently|airing/i.test(detail.status || "");
    items.push({
      question: `Is ${displayTitle} finished airing?`,
      answer: finished
        ? `Yes, ${displayTitle} has finished airing. The complete series is available to stream free on Anibinge.`
        : airing
          ? `No, ${displayTitle} is currently airing. New episodes are added to Anibinge as they are released.`
          : `${displayTitle} has not finished airing yet. Check back for new episodes as they are added to Anibinge.`,
    });
    items.push({
      question: `How many episodes does ${displayTitle} have?`,
      answer: detail.episodes
        ? `${displayTitle} has ${detail.episodes} episode${detail.episodes === 1 ? "" : "s"}. Stream them all free in HD on Anibinge.`
        : `The total episode count for ${displayTitle} depends on how many are released. You can stream every available episode free on Anibinge.`,
    });
    items.push({
      question: `Where can I watch ${displayTitle} online for free?`,
      answer: `You can watch ${displayTitle} online free on Anibinge. Stream every episode in HD with sub and dub audio, and track your progress with your watchlist.`,
    });
    items.push({
      question: `Is there a season 2 of ${displayTitle}?`,
      answer: detail.status && /finished/i.test(detail.status)
        ? `As of now, ${displayTitle} has aired ${detail.episodes || "its"} episode${detail.episodes === 1 ? "" : "s"}. Any sequel or season 2 announcement will be covered on Anibinge as soon as it's official.`
        : `${displayTitle} is ${/currently/i.test(detail.status || "") ? "currently airing" : "ongoing"}. If a season 2 is announced, Anibinge will have it available to stream free.`,
    });
    return items;
  }, [detail, displayTitle]);

  if (loading) {
    return <AnimeDetailSkeleton />;
  }

  if (error || !detail) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-primary-400" />
        <h1 className="mt-4 font-display text-xl font-bold">Temporarily unavailable</h1>
        <p className="mt-2 text-sm text-mist">
          We couldn't load this anime right now — this is usually a brief hiccup with the
          upstream data source. Please refresh the page in a moment.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Banner */}
      <div className="relative h-72 w-full overflow-hidden sm:h-96">
        {detail.trailer?.images?.maximum_image_url && (
          <Image src={detail.trailer.images.maximum_image_url} alt="" fill sizes="100vw" className="object-cover blur-sm brightness-50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void to-transparent" />
      </div>

      <div className="mx-auto -mt-32 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative -mt-4 w-40 shrink-0 overflow-hidden rounded-xl2 shadow-glow sm:w-56">
            {detail.images?.jpg?.large_image_url && (
              <Image
                src={detail.images.jpg.large_image_url}
                alt={detail.title}
                width={224}
                height={336}
                priority
                className="w-full object-cover"
              />
            )}
          </div>

          <div className="flex-1 pt-4">
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{detail.title_english || detail.title}</h1>
            <p className="text-mist">{detail.title_japanese}</p>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Stat icon={<Star className="h-4 w-4 text-primary-400" />} label="Score" value={detail.score ?? "N/A"} />
              <Stat icon={<TrendingUp className="h-4 w-4 text-primary-400" />} label="Popularity" value={`#${detail.popularity}`} />
              <Stat icon={<Users className="h-4 w-4 text-primary-400" />} label="Members" value={detail.members?.toLocaleString()} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {detail.genres?.map((g: any) => {
                const page = findGenreByName(g.name ?? "");
                return (
                  <Link
                    key={g.mal_id ?? g.name}
                    href={page ? `/genres/${page.slug}` : `/browse?genres=${encodeURIComponent(g.name)}`}
                    className="rounded-full bg-primary-600/20 px-3 py-1 text-xs text-primary-400 transition-colors hover:bg-primary-600/30"
                  >
                    {g.name}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <AddToWatchlistButton animeId={malId} source={source} />
              <DownloadButton
                title={detail.title_english || detail.title}
                anilistId={detail.anilist_id}
                totalEpisodes={detail.episodes}
              />
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-mist">{detail.synopsis}</p>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Field label="Studios" value={detail.studios?.map((s: any) => s.name).join(", ")} />
              <Field label="Status" value={detail.status} />
              <Field label="Episodes" value={detail.episodes ?? (detail.status === "currently_airing" ? "Ongoing" : "—")} />
              <Field label="Rating" value={detail.rating} />
            </dl>
          </div>
        </div>

        {characters.filter((c: any) => c.character?.name).length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold">Characters & Voice Actors</h2>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {characters.filter((c: any) => c.character?.name).slice(0, 12).map((c: any) => (
                <div key={c.character.mal_id ?? c.character.id} className="glass-card w-32 shrink-0 p-2 text-center">
                  <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-full">
                    {(c.character.images?.jpg?.image_url || c.character.main_picture?.large) && (
                      <Image
                        src={c.character.images?.jpg?.image_url || c.character.main_picture?.large}
                        alt={c.character.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-medium">{c.character.name}</p>
                  <p className="text-[10px] text-mist">{c.voice_actors?.[0]?.person?.name}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <LazyStreamingPlayer
          animeTitle={detail.title_english || detail.title}
          anilistId={detail.anilist_id}
          totalEpisodes={detail.episodes}
        />

        <FaqSection items={faqItems} />

        {recommendations.filter((r: any) => r.id && r.title && typeof r.title === "string" && r.title.length > 0).length > 0 && (
          <section className="mt-12 pb-12">
            <h2 className="font-display text-xl font-bold">You Might Also Like</h2>
            <AnimeGrid className="mt-4">
              {recommendations.filter((r: any) => r.id && r.title && typeof r.title === "string" && r.title.length > 0).slice(0, 12).map((r: any) => (
                <AnimeCard key={r.id} anime={r} />
              ))}
            </AnimeGrid>
          </section>
        )}
      </div>
    </div>
  );
}

function AnimeDetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="relative h-72 w-full overflow-hidden sm:h-96 bg-white/5" />

      <div className="mx-auto -mt-32 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative -mt-4 w-40 shrink-0 overflow-hidden rounded-xl2 sm:w-56">
            <div className="aspect-[2/3] w-full rounded-xl2 bg-white/10" />
          </div>

          <div className="flex-1 pt-4 space-y-4">
            <div className="h-8 w-3/4 rounded bg-white/10" />
            <div className="h-5 w-1/3 rounded bg-white/10" />

            <div className="flex flex-wrap gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-white/10" />
                  <div className="h-4 w-16 rounded bg-white/10" />
                  <div className="h-4 w-10 rounded bg-white/10" />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-6 w-16 rounded-full bg-white/10" />
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-28 rounded-lg bg-white/10" />
              <div className="h-9 w-28 rounded-lg bg-white/10" />
            </div>

            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-white/10" />
              <div className="h-4 w-5/6 rounded bg-white/10" />
              <div className="h-4 w-4/6 rounded bg-white/10" />
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="h-3 w-12 rounded bg-white/10 mb-1" />
                  <div className="h-4 w-20 rounded bg-white/10" />
                </div>
              ))}
            </dl>
          </div>
        </div>

        <section className="mt-12">
          <div className="h-6 w-56 rounded bg-white/10 mb-4" />
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="w-32 shrink-0 p-2 text-center">
                <div className="mx-auto h-20 w-20 rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-16 mx-auto rounded bg-white/10" />
                <div className="mt-1 h-2 w-12 mx-auto rounded bg-white/10" />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="aspect-video w-full rounded-xl bg-white/5" />
        </section>

        <section className="mt-12 pb-12">
          <div className="h-6 w-48 rounded bg-white/10 mb-4" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <div className="aspect-[3/4.25] w-full rounded-xl bg-white/10" />
                <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
                <div className="mt-1 h-3 w-1/2 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-mist">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-mist">{label}</dt>
      <dd className="mt-1 font-medium">{value || "—"}</dd>
    </div>
  );
}
