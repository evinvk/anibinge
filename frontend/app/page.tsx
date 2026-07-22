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
    console.error("Home page row fetch failed:", err);
    return null;
  }
}

async function TrendingRow() {
  const res = await safeFetch(() => api.trending());
  if (!res) return null;
  return <CarouselRow title="Trending Now" href="/browse?sort=trending" items={res.data} />;
}

async function AiringRow() {
  const res = await safeFetch(() => api.airing());
  if (!res) return null;
  return <CarouselRow title="Currently Airing" href="/browse?status=airing" items={res.data} />;
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

async function SeasonalRow() {
  const res = await safeFetch(() => api.currentSeason());
  if (!res) return null;
  return <CarouselRow title="This Season" href="/seasonal" items={res.data} />;
}

export default async function HomePage() {
  const heroRes = await safeFetch(() => api.trending());
  const heroAnime = heroRes?.data?.[0];

  return (
    <>
      {heroAnime && <HeroBanner anime={heroAnime} />}

      <Suspense fallback={<CarouselRow title="Trending Now" loading />}>
        <TrendingRow />
      </Suspense>
      <Suspense fallback={<CarouselRow title="Currently Airing" loading />}>
        <AiringRow />
      </Suspense>
      <Suspense fallback={<CarouselRow title="This Season" loading />}>
        <SeasonalRow />
      </Suspense>
      <Suspense fallback={<CarouselRow title="Top Rated" loading />}>
        <TopRatedRow />
      </Suspense>
      <Suspense fallback={<CarouselRow title="Upcoming Anime" loading />}>
        <UpcomingRow />
      </Suspense>

      <LatestReleasesSection />
    </>
  );
}
