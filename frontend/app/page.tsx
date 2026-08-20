import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LatestReleasesSection } from "@/components/latest-releases-section";
import { ManhwaLatestSection } from "@/components/manhwa-latest-section";
import { HomeSearch } from "@/components/home-search";
import { AnimeSectionTabs } from "@/components/anime-section-tabs";
import { LoginPopup } from "@/components/login-popup";
import { ContinueWatching } from "@/components/continue-watching";
import { TopTen } from "@/components/top-ten";
import { GENRE_PAGES } from "@/lib/genre-seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Watch Anime Online Free — Stream & Track Episodes",
  description:
    "Watch anime online free in HD. Stream sub & dub episodes, browse trending series, track your progress, and never miss new releases.",
  alternates: { canonical: "https://www.anibinge.fun/" },
  openGraph: {
    title: "Watch Anime Online Free — Stream & Track Episodes",
    description:
      "Watch anime online free in HD. Stream sub & dub episodes, browse trending series, track your progress.",
  },
};

const SITE_URL = "https://www.anibinge.fun";

async function safeFetch<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

export default async function HomePage() {
  const trendingRes = await safeFetch(() => api.trending(1));
  const trendingData = trendingRes?.data ?? [];

  const itemList = trendingData.slice(0, 10).map((item: any, i: number) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE_URL}/anime/${item.id || item.mal_id}?source=${item.source || "mal"}`,
    name: item.title_english || item.title || "",
    image: item.image || undefined,
  }));

  return (
    <>
      {itemList.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "Trending Anime",
              description: "Trending anime on Anibinge",
              numberOfItems: itemList.length,
              itemListElement: itemList,
            }),
          }}
        />
      )}

      <div className="pt-6">
        <h1 className="sr-only">Watch Anime Online Free — Stream &amp; Track Episodes</h1>
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-8">
            <HomeSearch />
            <ContinueWatching />
            <div>
              <AnimeSectionTabs />
            </div>
            <LatestReleasesSection />
            <ManhwaLatestSection />
          </div>

          <aside className="min-w-0 space-y-6">
            <TopTen />

            <div className="glass-card rounded-2xl p-4">
              <h2 className="font-display text-base font-bold text-paper">Explore</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href="/browse?type=movie" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">Movies</Link>
                <Link href="/browse?type=ova" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">OVA</Link>
                <Link href="/browse?type=special" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">Specials</Link>
                <Link href="/browse?type=ona" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">ONA</Link>
                <Link href="/az" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">A–Z Index</Link>
                <Link href="/schedule" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">Schedule</Link>
                <Link href="/seasonal" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">Seasonal</Link>
                <Link href="/news" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">News</Link>
                <Link href="/hindi-anime" className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper">Hindi Dubs</Link>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <h2 className="font-display text-base font-bold text-paper">Top Genres</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {GENRE_PAGES.slice(0, 12).map((g) => (
                  <Link
                    key={g.slug}
                    href={`/genres/${g.slug}`}
                    className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <LoginPopup />
    </>
  );
}
