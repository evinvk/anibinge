import type { Metadata } from "next";
import { ManhwaDetailClient } from "./manhwa-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

async function fetchManhwa(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${SITE_URL}/api/v1/manhwa/manga/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const manga = await fetchManhwa(id);
  if (!manga || !manga.title) return { title: "Manhwa not found" };

  const title = manga.title;
  const desc = manga.description?.slice(0, 160) || `Read ${title} online free on Anibinge. Browse chapters, rating, and status.`;
  const image = manga.poster || "/og.svg";
  const canonical = `${SITE_URL}/manhwa/${id}`;

  return {
    title: `Read ${title} Online — Chapters & Info`,
    description: desc,
    alternates: { canonical },
    keywords: [title, `${title} manhwa`, `${title} webtoon`, `${title} english`, "read manhwa online", "manhwa english translation", "korean comics online"],
    openGraph: {
      title: `Read ${title} Online Free`,
      description: desc,
      url: canonical,
      siteName: "Anibinge",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Read ${title} Online Free`,
      description: desc,
      images: [image],
    },
  };
}

export default async function ManhwaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const manga = await fetchManhwa(id);

  const jsonld = manga?.title
    ? {
        "@context": "https://schema.org",
        "@type": "ComicSeries",
        name: manga.title,
        description: manga.description,
        image: manga.poster,
        url: `${SITE_URL}/manhwa/${id}`,
        genre: manga.genres,
        ...(manga.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: manga.rating, bestRating: 10 } } : {}),
        ...(manga.status ? { creativeWorkStatus: manga.status } : {}),
      }
    : null;

  return (
    <>
      {jsonld && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      )}
      <ManhwaDetailClient id={id} />
    </>
  );
}
