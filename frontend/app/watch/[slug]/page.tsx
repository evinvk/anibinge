import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchWatchInfo(slug: string): Promise<{ title: string | null; totalEps: number | null; anilistId: number | null }> {
  const result = { title: null as string | null, totalEps: null as number | null, anilistId: null as number | null };

  try {
    const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/${slug}/info`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.data) {
      result.title = data.data.title;
      result.totalEps = data.data.episodes_count || null;
    }
  } catch {}

  if (!result.title) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      const match = data.data?.find((a: any) => a.slug === slug);
      if (match) {
        result.title = match.title;
        result.totalEps ??= match.episodes_count || match.actual_episodes_count || match.latest_episode || null;
      } else if (data.data?.length > 0) {
        result.title = data.data[0].title;
        result.totalEps ??= data.data[0].episodes_count || data.data[0].actual_episodes_count || data.data[0].latest_episode || null;
      }
    } catch {}
  }

  if (result.title) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(result.title)}`);
      const data = await res.json();
      if (data.anilist_id) result.anilistId = data.anilist_id;
      result.totalEps ??= data.episodes || null;
    } catch {}
  }

  return result;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const info = await fetchWatchInfo(slug);
  const title = info.title || slug.replace(/-/g, " ");

  return {
    title: `Watch ${title} Episodes Online Free — Sub & Dub`,
    description: `Watch ${title} online free. Stream all episodes in sub and dub. HD quality, no ads.`,
    openGraph: {
      title: `Watch ${title} Episodes Online Free — Sub & Dub`,
      description: `Stream ${title} online free. HD quality, sub & dub available.`,
    },
  };
}

export { default } from "./page-client";
