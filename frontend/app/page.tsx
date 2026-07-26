import { Suspense } from "react";
import { api } from "@/lib/api";
import { HeroBanner } from "@/components/hero-banner";
import { CarouselRow } from "@/components/carousel-row";
import { LatestReleasesSection } from "@/components/latest-releases-section";

export const revalidate = 300;

async function safeFetch<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    return null;
  }
}

async function TrendingRow({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;
  return <CarouselRow title="Trending Now" href="/browse?sort=trending" items={data} />;
}

export default async function HomePage() {
  const page1 = await safeFetch(() => api.trending(1));
  const page2 = page1 ? await safeFetch(() => api.trending(2)) : null;
  const page3 = page2 ? await safeFetch(() => api.trending(3)) : null;
  const pages = [page1, page2, page3];

  const seen = new Set<string | number>();
  const trendingData = pages
    .flatMap((p) => p?.data ?? [])
    .filter((anime) => {
      if (seen.has(anime.id)) return false;
      seen.add(anime.id);
      return true;
    });

  const heroAnime = trendingData[0];

  return (
    <>
      {heroAnime && <HeroBanner anime={heroAnime} />}

      <Suspense fallback={<CarouselRow title="Trending Now" loading />}>
        <TrendingRow data={trendingData} />
      </Suspense>

      <LatestReleasesSection />
    </>
  );
}
