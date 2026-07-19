import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime-card";
import type { AnimeSummary } from "@/lib/api";

interface CarouselRowProps {
  title: string;
  href?: string;
  items?: AnimeSummary[];
  loading?: boolean;
}

export function CarouselRow({ title, href, items, loading }: CarouselRowProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-paper sm:text-2xl">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center text-sm text-primary-400 hover:text-primary-300">
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-36 shrink-0 snap-start sm:w-44">
                <AnimeCardSkeleton />
              </div>
            ))
          : items?.map((anime) => (
              <div key={anime.id} className="w-36 shrink-0 snap-start sm:w-44">
                <AnimeCard anime={anime} />
              </div>
            ))}
      </div>
    </section>
  );
}
