import { AnimeDetailClient } from "./client";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import { cache } from "react";
import { resolveAnimeSlug } from "@/lib/resolve-anime-slug";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

const resolveSlugCached = cache((slug: string) => resolveAnimeSlug(slug));

function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

async function resolveIfSlug(id: string): Promise<string> {
  if (isNumericId(id)) return id;
  const resolution = await resolveSlugCached(id);
  if (!resolution) notFound();
  permanentRedirect(`/anime/${resolution.id}${resolution.source === "anilist" ? "?source=anilist" : ""}`);
  return "";
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const { id: rawId } = await params;
  const { source } = await searchParams;
  const id = await resolveIfSlug(rawId);
  try {
    const res = await fetch(`${SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`);
    const { data } = await res.json();
    const title = data.title_english || data.title || "Anime";
    const desc = data.synopsis?.slice(0, 160) || `Watch ${title} online free. Stream episodes, check ratings, and track your progress.`;
    const image = data.images?.jpg?.large_image_url || data.banner || "/og.svg";
    return {
      title: `Watch ${title} Online â€” Episodes & Info`,
      description: desc,
      alternates: { canonical: `${SITE_URL}/anime/${id}` },
      keywords: [title, `${title} anime`, "watch anime in hindi", "hindi dub", "english dub", "anime online"],
      openGraph: {
        title: `Watch ${title} Online Free`,
        description: desc,
        url: `${SITE_URL}/anime/${id}`,
        type: "website",
        images: [{ url: image, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image" as const,
        title: `Watch ${title} Online Free`,
        description: desc,
        images: [image],
      },
    };
  } catch {
    return { title: "Anime not found" };
  }
}

export default async function AnimeDetailPage({ params, searchParams }: PageProps) {
  const { id: rawId } = await params;
  const { source } = await searchParams;
  const id = await resolveIfSlug(rawId);

  let jsonld: Record<string, any> | null = null;
  let detailTitle: string | null = null;
  let watchSlug: string | null = null;
  let episodesCount = 0;
  try {
    const res = await fetch(`${SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`, { cache: "no-store" });
    const { data } = await res.json();
    if (data) {
      const title = data.title_english || data.title || "";
      detailTitle = title;
      episodesCount = Number(data.episodes) || 0;
      const isMovie = data.format === "MOVIE" || data.format === "movie";
      jsonld = {
        "@context": "https://schema.org",
        "@type": isMovie ? "Movie" : "TVSeries",
        name: title,
        url: `${SITE_URL}/anime/${id}`,
        description: data.synopsis?.slice(0, 300) || undefined,
        image: data.images?.jpg?.large_image_url || data.banner || undefined,
        genre: (data.genres || []).map((g: any) => g.name || g) || undefined,
        datePublished: data.start_date || undefined,
        inLanguage: data.audio === "dub" ? "en" : "ja",
        ...(data.episodes && !isMovie ? { numberOfEpisodes: data.episodes } : {}),
        ...(data.score ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: data.score,
            bestRating: 10,
            ratingCount: 1,
          },
        } : {}),
      };

      // Resolve the gogoanime watch slug server-side so the episode list
      // below is crawlable (client-side resolution is invisible to Google).
      // The search endpoint misses the main series for big titles, so check
      // the latest catalog first (reliable slug<->title source), then search.
      try {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const target = norm(title);
        let found: string | null = null;
        for (const p of [1, 2, 3]) {
          if (found) break;
          const latestRes = await fetch(
            `${SITE_URL}/api/v1/streaming/gogoanime/latest?page=${p}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const latestData = await latestRes.json();
          for (const a of latestData?.data ?? []) {
            const t = norm(a.title_english || a.title || "");
            if (t === target || (a.slug && norm(a.slug) === target)) {
              found = a.slug;
              break;
            }
          }
        }
        if (!found) {
          const searchRes = await fetch(
            `${SITE_URL}/api/v1/streaming/gogoanime/search?q=${encodeURIComponent(title)}`,
            { signal: AbortSignal.timeout(10000) }
          );
          const searchData = await searchRes.json();
          const items: any[] = searchData?.data ?? [];
          const match =
            items.find((a: any) => a.title && norm(a.title) === target) ||
            items.find((a: any) => a.title_english && norm(a.title_english) === target) ||
            (episodesCount === 1 ? items[0] : null);
          if (match?.slug) found = match.slug;
        }
        watchSlug = found;
      } catch {}
    }
  } catch {}

  const MAX_LINKS = 200;
  const episodeLinks = watchSlug && episodesCount > 0
    ? Array.from({ length: Math.min(episodesCount, MAX_LINKS) }, (_, i) => i + 1)
    : [];

  return (
    <>
      {jsonld && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }}
        />
      )}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {detailTitle ? (
          <Breadcrumbs
            siteUrl={SITE_URL}
            items={[{ label: "Anime", href: "/browse" }, { label: detailTitle }]}
          />
        ) : null}
      </div>
      <AnimeDetailClient id={id} source={source || "mal"} />
      {episodeLinks.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h2 className="font-display text-xl font-bold">
            Watch {detailTitle} Episodes Online
          </h2>
          <p className="mt-1 text-sm text-mist">
            Stream all {episodesCount} episodes free in HD — sub, dub and Hindi audio.
          </p>
          <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-14">
            {episodeLinks.map((n) => (
              <Link
                key={n}
                href={`/watch/${watchSlug}?ep=${n}`}
                className="rounded-lg bg-surface px-2 py-2 text-center text-sm font-medium text-paper transition-colors hover:bg-primary-600/30"
              >
                {n}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Watch Order Guide */}
      {detailTitle && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: `${detailTitle} Watch Order`,
                description: `Complete watch order for ${detailTitle} including TV series, movies, OVAs, and specials.`,
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: detailTitle,
                    url: `${SITE_URL}/anime/${id}`,
                    description: `Main series — ${episodesCount} episodes`
                  }
                ]
              })
            }}
          />
          <div className="rounded-2xl border border-white/10 bg-surface-hi/50 p-6">
            <h2 className="font-display text-xl font-bold">Watch Order Guide</h2>
            <p className="mt-2 text-sm text-mist">
              Recommended viewing order for {detailTitle}:
            </p>
            <ol className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">1</span>
                <div>
                  <p className="font-medium text-paper">{detailTitle} (Main Series)</p>
                  <p className="text-mist/70">{episodesCount} episodes</p>
                </div>
              </li>
            </ol>
            <p className="mt-4 text-xs text-mist/60">
              Check related anime below for sequels, prequels, and spin-offs.
            </p>
          </div>
        </section>
      )}

      {/* Filler Episodes */}
      {detailTitle && episodesCount > 20 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-white/10 bg-surface-hi/50 p-6">
            <h2 className="font-display text-xl font-bold">Filler Episodes</h2>
            <p className="mt-2 text-sm text-mist">
              {detailTitle} has a mix of canon and filler episodes. Below is a breakdown to help you decide what to watch.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h3 className="font-medium text-emerald-400">Canon Episodes (Essential)</h3>
                <p className="mt-1 text-sm text-mist">
                  Episodes that advance the main story. Watch these for the complete narrative.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h3 className="font-medium text-amber-400">Filler Episodes (Optional)</h3>
                <p className="mt-1 text-sm text-mist">
                  Episodes not based on the original manga. Can be skipped without missing plot.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-mist/60">
              Detailed filler lists are updated per series. Check animefillerlist.com for the most current breakdown.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
