import type { Metadata } from "next";
import { cache } from "react";
import WatchPageClient from "./page-client";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const fetchAnimeTitle = cache(async (slug: string): Promise<string> => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/${slug}/info`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.data?.title) return data.data.title;
  } catch {}

  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    const match = data.data?.find((a: any) => a.slug === slug);
    if (match?.title) return match.title;
    if (data.data?.length > 0) return data.data[0].title;
  } catch {}

  return slug.replace(/-/g, " ");
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { ep } = await searchParams;
  const episodeNumber = parseInt(ep || "1", 10) || 1;
  const title = await fetchAnimeTitle(slug);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun";
  const pageUrl = episodeNumber === 1 ? `${site}/watch/${slug}` : `${site}/watch/${slug}?ep=${episodeNumber}`;

  return {
    title: `Watch ${title} Episode ${episodeNumber} Online Free — Sub & Dub`,
    description: `Watch ${title} episode ${episodeNumber} online free. Stream all episodes in sub and dub. HD quality.`,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: `Watch ${title} Episode ${episodeNumber} Online Free — Sub & Dub`,
      description: `Stream ${title} episode ${episodeNumber} online free. HD quality, sub & dub available.`,
      url: pageUrl,
      type: "video.tv_show",
    },
    twitter: {
      card: "summary_large_image",
      title: `Watch ${title} Episode ${episodeNumber} Online Free`,
      description: `Stream ${title} online free. HD quality, sub & dub available.`,
    },
  };
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const [{ slug }, { ep }] = await Promise.all([params, searchParams]);
  const title = await fetchAnimeTitle(slug);
  const episodeNumber = parseInt(ep || "1", 10) || 1;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}/watch/${slug}?ep=${episodeNumber}`;

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${title} — Episode ${episodeNumber}`,
    description: `Watch ${title} episode ${episodeNumber} online free in sub and dub. HD quality.`,
    uploadDate: new Date().toISOString().split("T")[0],
    contentUrl: url,
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
        url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}/watch/${slug}`,
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <Breadcrumbs
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}
          items={[{ label: title, href: "/" }, { label: `Episode ${episodeNumber}` }]}
        />
      </div>
      <WatchPageClient params={params} />
    </>
  );
}
