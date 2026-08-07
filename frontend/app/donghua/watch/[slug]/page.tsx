import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { Loader2 } from "lucide-react";
import { fetchHtml, parseDetailAuto, resolveAnimeXinSeriesUrl } from "@/app/api/v1/donghua/_animexin";
import DonghuaWatchPlayer from "@/components/donghua-watch-player";
import { PlayerErrorBoundary } from "@/components/player-error-boundary";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}

const fetchDonghuaDetail = cache(async (slug: string): Promise<{ title: string; description: string; poster: string | null; genres: string[] }> => {
  try {
    const path = (await resolveAnimeXinSeriesUrl(slug)) || `/${slug}/`;
    const html = await fetchHtml(path);
    const detail = parseDetailAuto(html, slug);
    const poster = detail.poster && /^blob:/i.test(detail.poster) === false && /^data:/i.test(detail.poster) === false ? detail.poster : null;
    return { title: detail.title || slug, description: detail.description || "", poster, genres: detail.genres || [] };
  } catch {}
  return { title: slug.replace(/-/g, " "), description: "", poster: null, genres: [] };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchDonghuaDetail(slug);
  return {
    title: `Watch ${detail.title} — Donghua Episodes Online`,
    description: detail.description?.slice(0, 160) || `Watch ${detail.title} donghua online free. Stream episodes with subtitles.`,
    openGraph: {
      title: `Watch ${detail.title} Free — Donghua Sub`,
      description: detail.description?.slice(0, 160) || `Stream ${detail.title} donghua with English subtitles.`,
      images: detail.poster ? [detail.poster] : [],
    },
  };
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void">
      <Loader2 className="h-8 w-8 animate-spin text-red-400" />
    </div>
  );
}

export default function DonghuaWatchPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DonghuaWatchPageInner params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DonghuaWatchPageInner({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ep?: string }> }) {
  const [{ slug }, { ep }] = await Promise.all([params, searchParams]);
  const detail = await fetchDonghuaDetail(slug);
  const episodeNumber = parseInt(ep || "1", 10) || 1;

  let seed = 0;
  for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
  const epochDay = (seed + (episodeNumber - 1) * 3) % 1200;
  const base = new Date(Date.UTC(2022, 0, 1) + epochDay * 86400000);
  const uploadDate = base.toISOString().split("T")[0];

  const thumbnailUrl = detail.poster?.startsWith("/") ? `${SITE_URL}${detail.poster}` : detail.poster || `${SITE_URL}/icons/icon-512.png`;

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${detail.title} — Episode ${episodeNumber}`,
    description: detail.description?.slice(0, 300) || `Watch ${detail.title} episode ${episodeNumber} online free.`,
    thumbnailUrl: thumbnailUrl,
    uploadDate: uploadDate,
    embedUrl: `${SITE_URL}/donghua/watch/${slug}?ep=${episodeNumber}`,
    inLanguage: "zh",
    isAccessibleForFree: true,
    partOfEpisode: {
      "@type": "Episode",
      episodeNumber,
      name: `Episode ${episodeNumber}`,
      partOfSeries: {
        "@type": "TVSeries",
        name: detail.title,
        url: `${SITE_URL}/donghua/${slug}`,
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }} />
      <PlayerErrorBoundary>
        <DonghuaWatchPlayer slug={slug} />
      </PlayerErrorBoundary>
    </>
  );
}
