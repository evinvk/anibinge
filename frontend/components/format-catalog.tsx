"use client";

import { InfiniteAnimeGrid } from "@/components/infinite-anime-grid";
import type { AnimeSummary } from "@/lib/api";

interface FormatCatalogProps {
  type: string;
  label: string;
  initialItems: AnimeSummary[];
}

export function FormatCatalog({ type, label, initialItems }: FormatCatalogProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-paper sm:text-3xl">{label}</h1>
          <p className="mt-1 text-sm text-mist">
            {label === "Movies" ? "Feature-length anime films, ranked by popularity." :
             label === "OVA" ? "Original video animations — standalone and side-story episodes." :
             label === "ONA" ? "Original net animations — anime made for the web." :
             "Short one-off special episodes and extras from your favorite series."}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <InfiniteAnimeGrid initialItems={initialItems} query="anime" filters={{ type, order_by: "popularity" }} />
      </div>
    </>
  );
}
