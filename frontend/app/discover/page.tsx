import { api } from "@/lib/api";
import { CarouselRow } from "@/components/carousel-row";
import { DiscoverGrid } from "@/components/discover-grid";
export const dynamic = "force-dynamic";
export const metadata = { title: "Discover" };

export default async function DiscoverPage() {
  // "AI Recommendations" placeholder: currently backed by popularity-sorted
  // trending data. Swap in a real model (e.g. collaborative filtering over
  // watchlist data, or an LLM re-ranker) once user history exists.
  const { data: trending } = await api.trending();
  const hiddenGems = [...trending].reverse();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Discover</h1>
      <p className="mt-1 text-mist">Personalized picks, hidden gems, and community favorites.</p>

      <CarouselRow title="Hidden Gems" items={hiddenGems} />

      <h2 className="mt-8 font-display text-xl font-bold text-paper sm:text-2xl">
        Recommended For You
      </h2>
      <p className="mt-1 text-sm text-mist">Keep scrolling — more picks load automatically.</p>
      <DiscoverGrid initialItems={trending} />
    </div>
  );
}
