import type { Metadata } from "next";
import { AzIndex } from "@/components/az-index";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Anime A–Z — Browse the Full Alphabetical Index",
  description:
    "Browse the complete anime catalog alphabetically from A to Z. Find any anime by its English title and start watching free in HD on Anibinge.",
  openGraph: {
    title: "Anime A–Z — Browse the Full Alphabetical Index",
    description: "Find every anime by title in the full A–Z index and stream free in HD on Anibinge.",
    url: `${SITE_URL}/az`,
    siteName: "Anibinge",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default function AzPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-paper">A–Z Index</h1>
      <p className="mt-1 text-mist">Browse the entire catalog alphabetically by English title.</p>
      <div className="mt-8">
        <AzIndex />
      </div>
    </div>
  );
}
