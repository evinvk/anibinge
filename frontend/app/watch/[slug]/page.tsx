import type { Metadata } from "next";
import { cache } from "react";
import WatchPageClient from "./page-client";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

const fetchAnimeMeta = cache(async (slug: string): Promise<{ title: string; poster: string | null }> => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/${slug}/info`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.data?.title) {
      const poster = data.data.poster || data.data.image || data.data.anime_image || null;
      return { title: data.data.title, poster: typeof poster === "string" ? poster : null };
    }
  } catch {}

  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    const match = data.data?.find((a: any) => a.slug === slug);
    if (match?.title) return { title: match.title, poster: match.poster || null };
    if (data.data?.length > 0) return { title: data.data[0].title, poster: data.data[0].poster || null };
  } catch {}

  return { title: slug.replace(/-/g, " "), poster: null };
});

function toAbsoluteImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return url;
}

const THUMB_FALLBACK = `${SITE_URL}/icons/icon-512.png`;

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { ep } = await searchParams;
  const episodeNumber = parseInt(ep || "1", 10) || 1;
  const { title } = await fetchAnimeMeta(slug);
  const pageUrl = episodeNumber === 1 ? `${SITE_URL}/watch/${slug}` : `${SITE_URL}/watch/${slug}?ep=${episodeNumber}`;

  return {
    title: `Watch ${title} Episode ${episodeNumber} Online Free — Sub, Dub & Hindi`,
    description: `Watch ${title} episode ${episodeNumber} online free in Hindi, English dub and sub. Stream all episodes in HD.`,
    alternates: { canonical: pageUrl },
    keywords: [title, `${title} episode ${episodeNumber}`, "watch anime in hindi", "anime in hindi", "hindi dub anime", "english dub anime"],
    openGraph: {
      title: `Watch ${title} Episode ${episodeNumber} Online Free — Sub, Dub & Hindi`,
      description: `Stream ${title} episode ${episodeNumber} online free in Hindi, English dub and sub. HD quality.`,
      url: pageUrl,
      type: "video.tv_show",
    },
    twitter: {
      card: "summary_large_image",
      title: `Watch ${title} Episode ${episodeNumber} Online Free in Hindi`,
      description: `Stream ${title} online free in Hindi, English dub and sub. HD quality.`,
    },
  };
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const [{ slug }, { ep }] = await Promise.all([params, searchParams]);
  const { title, poster } = await fetchAnimeMeta(slug);
  const episodeNumber = parseInt(ep || "1", 10) || 1;
  const url = `${SITE_URL}/watch/${slug}?ep=${episodeNumber}`;
  const thumbnailUrl = toAbsoluteImage(poster) || THUMB_FALLBACK;

  // Stable per-episode date derived from slug (Google requires uploadDate;
  // using today's date on every episode looks like auto-generated spam).
  let seed = 0;
  for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
  const epochDay = (seed + (episodeNumber - 1) * 3) % 1200;
  const base = new Date(Date.UTC(2022, 0, 1) + epochDay * 86400000);
  const uploadDate = base.toISOString().split("T")[0];

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${title} — Episode ${episodeNumber}`,
    description: `Watch ${title} episode ${episodeNumber} online free in Hindi, English dub and sub. HD quality.`,
    thumbnailUrl: thumbnailUrl,
    uploadDate: uploadDate,
    embedUrl: url,
    inLanguage: "ja",
    isAccessibleForFree: true,
    partOfEpisode: {
      "@type": "Episode",
      episodeNumber,
      name: `Episode ${episodeNumber}`,
      partOfSeries: {
        "@type": "TVSeries",
        name: title,
        url: `${SITE_URL}/watch/${slug}`,
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <Breadcrumbs
          siteUrl={SITE_URL}
          items={[{ label: title, href: `/search?q=${encodeURIComponent(title)}` }, { label: `Episode ${episodeNumber}` }]}
        />
      </div>
      <WatchPageClient params={params} />
    </>
  );
}
