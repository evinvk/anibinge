import { api } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { SeasonTabs } from "@/components/season-tabs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Seasonal Anime" };

const SEASONS = ["winter", "spring", "summer", "fall"] as const;

function currentSeasonInfo() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const season = month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : month <= 11 ? "fall" : "winter";
  return { year, season };
}

interface Props {
  searchParams: Promise<{ year?: string; season?: string }>;
}

export default async function SeasonalPage({ searchParams }: Props) {
  const params = await searchParams;
  const fallback = currentSeasonInfo();
  const year = Number(params.year) || fallback.year;
  const season = (params.season as (typeof SEASONS)[number]) || fallback.season;

  let res: any = { data: [] };
  try {
    res = await api.season(year, season);
  } catch (err) {
    console.error("Seasonal fetch failed:", err);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Seasonal Anime</h1>
      <p className="mt-1 text-mist">Browse by season, or jump to a timeline / calendar view.</p>

      <SeasonTabs currentYear={year} currentSeason={season} seasons={SEASONS} />

      <AnimeGrid className="mt-8">
        {res.data?.map((item: any) => (
          <AnimeCard
            key={item.id}
            anime={item}
          />
        ))}
      </AnimeGrid>
    </div>
  );
}
