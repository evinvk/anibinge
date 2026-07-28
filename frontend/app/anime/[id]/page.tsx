import { AnimeDetailClient } from "./client";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { source } = await searchParams;
  try {
    const { data } = await (await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`)).json();
    const title = data.title_english || data.title || "Anime";
    return { title: `Watch ${title} Online — Episodes & Info` };
  } catch {
    return { title: "Anime not found" };
  }
}

export default async function AnimeDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { source } = await searchParams;
  return <AnimeDetailClient id={id} source={source || "mal"} />;
}
