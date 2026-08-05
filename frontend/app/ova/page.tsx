import type { Metadata } from "next";
import { FormatCatalog } from "@/components/format-catalog";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Anime OVA — Watch Original Video Animations Free",
  description:
    "Watch anime OVAs online free in HD. Stream original video animations and side-story episodes with sub and dub audio on Anibinge.",
  openGraph: {
    title: "Anime OVA — Watch Original Video Animations Free",
    description: "Stream anime OVA episodes free in HD with sub and dub audio on Anibinge.",
    url: `${SITE_URL}/ova`,
    siteName: "Anibinge",
    type: "website",
    images: [{ url: "/og.svg", width: 1200, height: 630 }],
  },
};

export default async function OvaPage() {
  const initialItems = await fetch(
    `${SITE_URL}/api/v1/search?q=anime&type=ova&order_by=popularity&page=1`,
    { next: { revalidate: 300 } }
  ).then((r) => r.ok ? r.json() : { data: [] }).then((j) => j.data ?? []).catch(() => []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <FormatCatalog type="ova" label="OVA" initialItems={initialItems} />
    </div>
  );
}
