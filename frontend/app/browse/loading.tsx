import { AnimeCardSkeleton, AnimeGrid } from "@/components/anime-card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="h-8 w-48 animate-pulse rounded bg-surface-hi" />
      <AnimeGrid className="mt-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <AnimeCardSkeleton key={i} />
        ))}
      </AnimeGrid>
    </div>
  );
}
