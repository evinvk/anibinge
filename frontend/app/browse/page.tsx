import { BrowseFilters } from "@/components/browse-filters";
import { InfiniteAnimeGrid } from "@/components/infinite-anime-grid";

export const metadata = {
  title: "Browse Anime by Genre, Season & Studio",
  description:
    "Browse thousands of anime to watch online free. Filter by genre, season, studio, status, and more. Find your next favorite show to stream.",
};

interface BrowsePageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const query = params.q || "anime";

  const filters: Record<string, string> = {
    ...(params.genres ? { genres: params.genres } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.order_by ? { order_by: params.order_by } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
  };

  // The InfiniteAnimeGrid loads data client-side.
  // Return empty initialItems so it always fetches on the client
  // (avoids SSR fetch timing out or failing for filtered queries).
  const data: any[] = [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">
        {params.status === "upcoming" ? "Upcoming Anime" : "Browse"}
      </h1>
      <p className="mt-1 text-mist">
        {params.status === "upcoming"
          ? "Anime scheduled to air soon."
          : "Search and filter across the full anime catalog."}
      </p>

      <BrowseFilters />

      <InfiniteAnimeGrid initialItems={data} query={query} filters={filters} />
    </div>
  );
}
