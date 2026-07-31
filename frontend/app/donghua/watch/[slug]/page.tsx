import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { fetchHtml, parseDetailAuto } from "@/app/api/v1/donghua/_animexin";
import DonghuaWatchPlayer from "@/components/donghua-watch-player";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}

async function fetchDonghuaDetail(slug: string): Promise<{ title: string; description: string; poster: string | null; genres: string[] }> {
  try {
    const html = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(html, slug);
    return { title: detail.title || slug, description: detail.description || "", poster: detail.poster, genres: detail.genres || [] };
  } catch {}
  return { title: slug.replace(/-/g, " "), description: "", poster: null, genres: [] };
}

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

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${detail.title} — Episode ${episodeNumber}`,
    description: detail.description?.slice(0, 300) || `Watch ${detail.title} episode ${episodeNumber} online free.`,
    thumbnailUrl: detail.poster || undefined,
    uploadDate: new Date().toISOString().split("T")[0],
    contentUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}/donghua/watch/${slug}?ep=${episodeNumber}`,
    embedUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}/donghua/watch/${slug}?ep=${episodeNumber}`,
    inLanguage: "zh",
    isAccessibleForFree: true,
    partOfEpisode: {
      "@type": "Episode",
      episodeNumber,
      name: `Episode ${episodeNumber}`,
      partOfSeries: {
        "@type": "TVSeries",
        name: detail.title,
        url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun"}/donghua/${slug}`,
      },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }} />
      <DonghuaWatchPlayer slug={slug} />
    </>
  );
}
