import { Suspense } from "react";
import { api } from "@/lib/api";
import { HeroBanner } from "@/components/hero-banner";
import { CarouselRow } from "@/components/carousel-row";
export const dynamic = "force-dynamic";
export const revalidate = 300; // ISR: page regenerates at most every 5 min

async function TrendingRow() {
  const { data } = await api.trending();
  return <CarouselRow title="Trending Now" href="/browse?sort=trending" items={data} />;
}

async function AiringRow() {
  const res = await api.airing();
  return <CarouselRow title="Currently Airing" href="/browse?status=airing" items={res.data?.map(normalizeJikan)} />;
}

async function UpcomingRow() {
  const res = await api.upcoming();
  return <CarouselRow title="Upcoming Anime" href="/browse?status=upcoming" items={res.data?.map(normalizeJikan)} />;
}

async function TopRatedRow() {
  const res = await api.topRated();
  return <CarouselRow title="Top Rated" href="/browse?sort=score" items={res.data?.map(normalizeJikan)} />;
}

async function SeasonalRow() {
  const res = await api.currentSeason();
  return <CarouselRow title="This Season" href="/seasonal" items={res.data?.map(normalizeJikan)} />;
}

// Jikan's raw shape -> the AnimeSummary shape our cards expect
// (the backend already normalizes /trending; other endpoints are
// passed through raw from Jikan for flexibility, so we adapt here)
function normalizeJikan(item: any) {
  return {
    id: item.mal_id,
    source: "jikan" as const,
    title: item.title,
    title_english: item.title_english,
    image: item.images?.jpg?.large_image_url,
    banner: item.trailer?.images?.maximum_image_url ?? null,
    score: item.score,
    popularity: item.popularity,
    episodes: item.episodes,
    status: item.status,
    genres: item.genres?.map((g: any) => g.name) ?? [],
    synopsis: item.synopsis,
    year: item.year,
    season: item.season,
    format: item.type,
  };
}

export default async function HomePage() {
  const { data: trending } = await api.trending();
  const heroAnime = trending?.[0];

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
    </>
  );
}
