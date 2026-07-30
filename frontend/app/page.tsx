import type { Metadata } from "next";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { HeroBanner } from "@/components/hero-banner";
import { CarouselRow } from "@/components/carousel-row";
import { LatestReleasesSection } from "@/components/latest-releases-section";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Watch Anime Online Free — Stream & Track Episodes",
  description:
    "Watch anime online free in HD. Stream sub & dub episodes, browse trending series, track your progress, and never miss new releases.",
  openGraph: {
    title: "Watch Anime Online Free — Stream & Track Episodes",
    description:
      "Watch anime online free in HD. Stream sub & dub episodes, browse trending series, track your progress.",
  },
};

const SITE_URL = "https://anibinge.fun";

async function safeFetch<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

async function TrendingRow({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;
  return <CarouselRow title="Trending Now" href="/browse?sort=trending" items={data} />;
}

export default async function HomePage() {
  const trendingRes = await safeFetch(() => api.trending(1));
  const trendingData = trendingRes?.data ?? [];
  const heroAnime = trendingData[0];

  const itemList = trendingData.slice(0, 10).map((item: any, i: number) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE_URL}/anime/${item.id || item.mal_id}?source=${item.source || "mal"}`,
    name: item.title_english || item.title || "",
    image: item.image || undefined,
  }));

  return (
    <>
      {itemList.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "Trending Anime",
              description: "Trending anime on Anibinge",
              numberOfItems: itemList.length,
              itemListElement: itemList,
            }),
          }}
        />
      )}

      {heroAnime && <HeroBanner anime={heroAnime} />}

      <Suspense fallback={<CarouselRow title="Trending Now" loading />}>
        <TrendingRow data={trendingData} />
      </Suspense>

      <LatestReleasesSection />
    </>
  );
}
