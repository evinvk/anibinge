import type { Metadata } from "next";
import { FormatCatalog } from "@/components/format-catalog";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Anime Movies — Watch Full-Length Films Free",
  description:
    "Watch anime movies online free in HD. Stream popular feature films with sub and dub audio, track your watchlist, and never miss new movie releases.",
  openGraph: {
    title: "Anime Movies — Watch Full-Length Films Free",
    description: "Stream popular anime films free in HD with sub and dub audio on Anibinge.",
    url: `${SITE_URL}/movies`,
    siteName: "Anibinge",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default async function MoviesPage() {
  const initialItems = await fetch(
    `${SITE_URL}/api/v1/search?q=anime&type=movie&order_by=popularity&page=1`,
    { next: { revalidate: 300 } }
  ).then((r) => r.ok ? r.json() : { data: [] }).then((j) => j.data ?? []).catch(() => []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <FormatCatalog type="movie" label="Movies" initialItems={initialItems} />
    </div>
  );
}
