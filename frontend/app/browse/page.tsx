import { api } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { BrowseFilters } from "@/components/browse-filters";

export const metadata = { title: "Browse Anime" };

interface BrowsePageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const query = params.q || "anime";

  let data: Awaited<ReturnType<typeof api.search>>["data"] = [];
  let fetchFailed = false;
  try {
    const res = await api.search(query, {
      ...(params.genres ? { genres: params.genres } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.order_by ? { order_by: params.order_by } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
    });
    data = res.data;
  } catch (err) {
    console.error("Browse search failed:", err);
    fetchFailed = true;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Browse</h1>
      <p className="mt-1 text-mist">Search and filter across the full anime catalog.</p>

      <BrowseFilters />

      <AnimeGrid className="mt-8">
        {data.map((anime) => (
          <AnimeCard key={anime.id} anime={anime} />
        ))}
      </AnimeGrid>

      {data.length === 0 && (
        <div className="mt-16 text-center text-mist">
          {fetchFailed
            ? "The anime database is temporarily unavailable. Please try again in a moment."
            : "No results. Try a different search term or clear your filters."}
        </div>
      )}
    </div>
  );
}
