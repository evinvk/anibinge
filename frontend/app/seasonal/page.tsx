import { SeasonalContent } from "./seasonal-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seasonal Anime — What's New This Season",
  description:
    "See what's airing this anime season. Browse winter, spring, summer, and fall lineups. never miss a new release.",
};

interface Props {
  searchParams: Promise<{ year?: string; season?: string }>;
}

export default async function SeasonalPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Seasonal Anime</h1>
      <p className="mt-1 text-mist">Browse by season, or jump to a timeline / calendar view.</p>
      <SeasonalContent year={params.year} season={params.season} />
    </div>
  );
}
