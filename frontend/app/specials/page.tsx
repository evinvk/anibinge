import type { Metadata } from "next";
import { FormatCatalog } from "@/components/format-catalog";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Anime Specials — Watch Short Episodes & Extras Free",
  description:
    "Watch anime specials online free in HD. Stream short one-off episodes and extras from popular series with sub and dub audio on Anibinge.",
  openGraph: {
    title: "Anime Specials — Watch Short Episodes & Extras Free",
    description: "Stream anime special episodes free in HD with sub and dub audio on Anibinge.",
    url: `${SITE_URL}/specials`,
    siteName: "Anibinge",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default function SpecialsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <FormatCatalog type="special" label="Specials" />
    </div>
  );
}
