import type { Metadata } from "next";
import { cache } from "react";
import DownloadPageClient from "./download-page-client";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string; anilist_id?: string }>;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

interface AnimeInfo {
  title: string | null;
  episodes_count: number | null;
  anilist_id: number | null;
}

const fetchAnimeInfo = cache(async (slug: string): Promise<AnimeInfo> => {
  let info: AnimeInfo = { title: null, episodes_count: null, anilist_id: null };

  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/${slug}/info`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.data) {
      info.title = data.data.title ?? null;
      info.episodes_count = data.data.episodes_count ?? null;
    }
  } catch {}

  if (!info.title) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      const match = data.data?.find((a: any) => a.slug === slug);
      if (match) {
        info.title = match.title ?? null;
        info.episodes_count = match.episodes_count || match.actual_episodes_count || match.latest_episode || null;
      } else if (data.data?.length > 0) {
        info.title = data.data[0].title ?? null;
        info.episodes_count = data.data[0].episodes_count || data.data[0].actual_episodes_count || data.data[0].latest_episode || null;
      }
    } catch {}
  }

  if (!info.title) {
    info.title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(info.title)}`, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    if (data.anilist_id) info.anilist_id = data.anilist_id;
    if (data.episodes) info.episodes_count = info.episodes_count ?? data.episodes;
  } catch {}

  return info;
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { ep } = await searchParams;
  const episodeNumber = parseInt(ep || "", 10) || 0;
  const info = await fetchAnimeInfo(slug);
  const title = info.title || slug.replace(/-/g, " ");

  if (episodeNumber > 0) {
    const pageUrl = `${SITE_URL}/download/${slug}?ep=${episodeNumber}`;
    return {
      title: `Download ${title} Episode ${episodeNumber} MP4 — Sub & Dub`,
      description: `Download ${title} episode ${episodeNumber} in MP4 format, subtitled or English dubbed, free on Anibinge.`,
      alternates: { canonical: pageUrl },
      keywords: [`${title} episode ${episodeNumber} download`, `${title} mp4 download`, "anime download", "download anime episodes"],
      openGraph: {
        title: `Download ${title} Episode ${episodeNumber} MP4`,
        description: `Download ${title} episode ${episodeNumber} in MP4, sub or dub, free on Anibinge.`,
        url: pageUrl,
      },
    };
  }

  const pageUrl = `${SITE_URL}/download/${slug}`;
  return {
    title: `Download ${title} All Episodes MP4 — Sub & Dub`,
    description: `Download all episodes of ${title} in MP4 format, subtitled or English dubbed, free on Anibinge.`,
    alternates: { canonical: pageUrl },
    keywords: [`${title} download`, `${title} all episodes download`, "anime download", "download anime episodes", "anime mp4"],
    openGraph: {
      title: `Download ${title} All Episodes MP4`,
      description: `Download all episodes of ${title} in MP4, sub or dub, free on Anibinge.`,
      url: pageUrl,
    },
  };
}

export default async function DownloadPage({ params, searchParams }: PageProps) {
  const [{ slug }, { ep, anilist_id }] = await Promise.all([params, searchParams]);
  const episodeNumber = parseInt(ep || "", 10) || 0;
  const info = await fetchAnimeInfo(slug);

  const anilistId = info.anilist_id || (anilist_id ? parseInt(anilist_id, 10) || null : null);

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <Breadcrumbs
          siteUrl={SITE_URL}
          items={[
            { label: "Downloads", href: "/" },
            ...(episodeNumber > 0
              ? [
                  { label: info.title || slug, href: `/download/${slug}` },
                  { label: `Episode ${episodeNumber}` },
                ]
              : [{ label: info.title || slug }]),
          ]}
        />
      </div>
      <DownloadPageClient
        slug={slug}
        title={info.title || slug.replace(/-/g, " ")}
        totalEps={info.episodes_count}
        anilistId={anilistId}
        initialEp={episodeNumber}
      />
    </>
  );
}
