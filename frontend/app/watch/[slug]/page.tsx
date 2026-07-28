import type { Metadata } from "next";
import WatchPageClient from "./page-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchAnimeTitle(slug: string): Promise<string | null> {
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
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = await fetchAnimeTitle(slug);

  return {
    title: `Watch ${title} Episodes Online Free — Sub & Dub`,
    description: `Watch ${title} online free. Stream all episodes in sub and dub. HD quality.`,
    openGraph: {
      title: `Watch ${title} Episodes Online Free — Sub & Dub`,
      description: `Stream ${title} online free. HD quality, sub & dub available.`,
    },
  };
}

export default function WatchPage({ params }: PageProps) {
  return <WatchPageClient params={params} />;
}
