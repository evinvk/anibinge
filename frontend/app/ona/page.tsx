import type { Metadata } from "next";
import { FormatCatalog } from "@/components/format-catalog";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Anime ONA — Watch Original Net Animations Free",
  description:
    "Watch anime ONA online free in HD. Stream original net animations made for the web with sub and dub audio on Anibinge.",
  openGraph: {
    title: "Anime ONA — Watch Original Net Animations Free",
    description: "Stream anime ONA series free in HD with sub and dub audio on Anibinge.",
    url: `${SITE_URL}/ona`,
    siteName: "Anibinge",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default async function OnaPage() {
  const initialItems = await fetch(
    `${SITE_URL}/api/v1/search?q=anime&type=ona&order_by=popularity&page=1`,
    { next: { revalidate: 300 } }
  ).then((r) => r.ok ? r.json() : { data: [] }).then((j) => j.data ?? []).catch(() => []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <FormatCatalog type="ona" label="ONA" initialItems={initialItems} />
    </div>
  );
}
