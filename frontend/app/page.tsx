import { Suspense } from "react";
import { api } from "@/lib/api";
import { HeroBanner } from "@/components/hero-banner";
import { CarouselRow } from "@/components/carousel-row";
import { LatestReleasesSection } from "@/components/latest-releases-section";
import { AdsterraAd } from "@/components/adsterra-ad";

export const revalidate = 300;

async function safeFetch<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    return null;
  }
}

async function TrendingRow({ data }: { data: any }) {
  if (!data) return null;
  return <CarouselRow title="Trending Now" href="/browse?sort=trending" items={data} />;
}

async function UpcomingRow() {
  const res = await safeFetch(() => api.upcoming());
  if (!res) return null;
  return <CarouselRow title="Upcoming Anime" href="/browse?status=upcoming" items={res.data} />;
}

async function TopRatedRow() {
  const res = await safeFetch(() => api.topRated());
  if (!res) return null;
  return <CarouselRow title="Top Rated" href="/browse?sort=score" items={res.data} />;
}

export default async function HomePage() {
  const trendingRes = await safeFetch(() => api.trending());
  const trendingData = trendingRes?.data;
  const heroAnime = trendingData?.[0];

  return (
    <>
      {heroAnime && <HeroBanner anime={heroAnime} />}

      <Suspense fallback={<CarouselRow title="Trending Now" loading />}>
        <TrendingRow data={trendingData} />
      </Suspense>

      <LatestReleasesSection />

      <Suspense fallback={<CarouselRow title="Top Rated" loading />}>
        <TopRatedRow />
      </Suspense>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <AdsterraAd className="flex justify-center" />
      </div>

      <Suspense fallback={<CarouselRow title="Upcoming Anime" loading />}>
        <UpcomingRow />
      </Suspense>
    </>
  );
}
