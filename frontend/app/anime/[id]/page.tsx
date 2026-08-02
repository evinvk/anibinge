import { AnimeDetailClient } from "./client";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { permanentRedirect, notFound } from "next/navigation";
import { cache } from "react";
import { resolveAnimeSlug } from "@/lib/resolve-anime-slug";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

const SITE_URL = "https://anibinge.fun";

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
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`);
    const { data } = await res.json();
    const title = data.title_english || data.title || "Anime";
    const desc = data.synopsis?.slice(0, 160) || `Watch ${title} online free. Stream episodes, check ratings, and track your progress.`;
    const image = data.images?.jpg?.large_image_url || data.banner || "/og.svg";
    return {
      title: `Watch ${title} Online — Episodes & Info`,
      description: desc,
      alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/anime/${id}` },
      keywords: [title, `${title} anime`, "watch anime in hindi", "hindi dub", "english dub", "anime online"],
      openGraph: {
        title: `Watch ${title} Online Free`,
        description: desc,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/anime/${id}`,
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
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`, { cache: "no-store" });
    const { data } = await res.json();
    if (data) {
      const title = data.title_english || data.title || "";
      detailTitle = title;
      const isMovie = data.format === "MOVIE" || data.format === "movie";
      jsonld = {
        "@context": "https://schema.org",
        "@type": isMovie ? "Movie" : "TVSeries",
        name: title,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/anime/${id}`,
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
    }
  } catch {}

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
            siteUrl={process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}
            items={[{ label: "Anime", href: "/browse" }, { label: detailTitle }]}
          />
        ) : null}
      </div>
      <AnimeDetailClient id={id} source={source || "mal"} />
    </>
  );
}
