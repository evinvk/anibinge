import { AnimeDetailClient } from "./client";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

const SITE_URL = "https://anibinge.fun";

export async function generateMetadata({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { source } = await searchParams;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`);
    const { data } = await res.json();
    const title = data.title_english || data.title || "Anime";
    const desc = data.synopsis?.slice(0, 160) || `Watch ${title} online free. Stream episodes, check ratings, and track your progress.`;
    const image = data.image || data.banner || "/og.svg";
    return {
      title: `Watch ${title} Online — Episodes & Info`,
      description: desc,
      openGraph: {
        title: `Watch ${title} Online Free`,
        description: desc,
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
  const { id } = await params;
  const { source } = await searchParams;

  let jsonld: Record<string, any> | null = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || SITE_URL}/api/v1/anime/${id}${source ? `?source=${source}` : ""}`, { cache: "no-store" });
    const { data } = await res.json();
    if (data) {
      const title = data.title_english || data.title || "";
      const isMovie = data.format === "MOVIE" || data.format === "movie";
      jsonld = {
        "@context": "https://schema.org",
        "@type": isMovie ? "Movie" : "TVSeries",
        name: title,
        description: data.synopsis?.slice(0, 300) || undefined,
        image: data.image || data.banner || undefined,
        genre: data.genres || undefined,
        datePublished: data.start_date || undefined,
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
      <AnimeDetailClient id={id} source={source || "mal"} />
    </>
  );
}
