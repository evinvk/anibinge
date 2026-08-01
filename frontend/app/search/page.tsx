import { InfiniteAnimeGrid } from "@/components/infinite-anime-grid";
import { SearchForm } from "@/components/search-form";

export const metadata = {
  title: "Search Anime — Find Any Series to Watch Free",
  description:
    "Search the full Anibinge anime catalog by title. Find any series, check ratings, genres, and start streaming episodes free in HD with sub and dub.",
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Search Anime</h1>
      <p className="mt-1 text-mist">
        Find any series by title and start streaming free.
      </p>

      <div className="mt-6">
        <SearchForm initialQuery={query} />
      </div>

      <div className="mt-6">
        <InfiniteAnimeGrid
          initialItems={[]}
          query={query || "anime"}
          filters={{}}
        />
      </div>
    </div>
  );
}
