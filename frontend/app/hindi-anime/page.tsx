import type { Metadata } from "next";
import Link from "next/link";
import { Languages } from "lucide-react";
import { HINDI_ANIME } from "@/lib/hindi-seo";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type { AnimeSummary } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun";

export const metadata: Metadata = {
  title: "Watch Anime in Hindi — Hindi Dubbed Anime Online Free",
  description:
    "Watch anime in Hindi online free. Stream the best Hindi dubbed anime like Naruto, Demon Slayer, Jujutsu Kaisen and One Piece in HD with full episode lists.",
  openGraph: {
    title: "Watch Anime in Hindi Online Free — Anibinge",
    description:
      "Stream the best Hindi dubbed anime online free in HD — Naruto, Demon Slayer, Jujutsu Kaisen, One Piece and more.",
    url: `${SITE_URL}/hindi-anime`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch Anime in Hindi Online Free — Anibinge",
    description:
      "Stream the best Hindi dubbed anime online free in HD — Naruto, Demon Slayer, Jujutsu Kaisen, One Piece and more.",
  },
  alternates: { canonical: `${SITE_URL}/hindi-anime` },
  keywords: [
    "watch anime in hindi",
    "hindi dubbed anime",
    "anime in hindi",
    "hindi anime online",
    "naruto in hindi",
    "demon slayer in hindi",
    "jujutsu kaisen in hindi",
    "one piece in hindi",
  ],
};

export const dynamic = "force-static";
export const revalidate = 86400;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function fetchHindiAnime(): Promise<AnimeSummary[]> {
  const ids = HINDI_ANIME.map((h) => h.anilistId);
  const query = `query($ids:[Int]){
    Page(page:1,perPage:50){
      media(id_in:$ids,type:ANIME,countryOfOrigin:JP){
        id idMal title{english romaji native}
        coverImage{large} bannerImage
        averageScore popularity episodes status genres description
        startDate{year month day} season format
      }
    }
  }`;
  try {
    const resp = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { ids } }),
      next: { revalidate: 86400 },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    return media
      .filter((m: any) => m.title?.english || m.title?.romaji)
      .map((m: any): AnimeSummary => ({
        id: m.idMal || m.id,
        source: "anilist",
        title: m.title?.english || m.title?.romaji || "",
        title_english: m.title?.english || null,
        image: m.coverImage?.large || null,
        banner: m.bannerImage || null,
        score: m.averageScore ? m.averageScore / 10 : null,
        popularity: m.popularity || null,
        episodes: m.episodes || null,
        status: m.status || null,
        genres: m.genres || [],
        synopsis: m.description?.replace(/<[^>]*>/g, "")?.slice(0, 500) || null,
        year: m.startDate?.year || null,
        season: m.season || null,
        format: m.format || null,
        start_date: m.startDate
          ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}`
          : null,
      }));
  } catch {
    return [];
  }
}

export default async function HindiAnimePage() {
  const items = await fetchHindiAnime();

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Watch Anime in Hindi — Hindi Dubbed Anime Online Free",
    url: `${SITE_URL}/hindi-anime`,
    description:
      "Watch the best Hindi dubbed anime online free in HD — Naruto, Demon Slayer, Jujutsu Kaisen, One Piece and more.",
    isPartOf: {
      "@type": "WebSite",
      name: "Anibinge",
      url: SITE_URL,
    },
    hasPart: items.slice(0, 12).map((a) => ({
      "@type": "TVSeries",
      name: a.title_english || a.title,
      url: `${SITE_URL}/anime/${a.id}`,
    })),
  };

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }}
        />

        <div className="mt-4">
          <Breadcrumbs
            siteUrl={SITE_URL}
            items={[{ label: "Anime", href: "/" }, { label: "Hindi Dubbed Anime" }]}
          />
        </div>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 rounded-full bg-primary-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-primary-400">Hindi Dubs</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper sm:text-4xl">
            Watch Anime in Hindi
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            Stream the most popular <strong className="text-paper">Hindi dubbed anime</strong> online free in HD.
            From long-running classics like <Link href="/anime/20" className="text-primary-400 hover:underline">Naruto</Link>{" "}
            and <Link href="/anime/21" className="text-primary-400 hover:underline">One Piece</Link> to the biggest
            modern hits like <Link href="/anime/113415" className="text-primary-400 hover:underline">Jujutsu Kaisen</Link>{" "}
            and <Link href="/anime/101922" className="text-primary-400 hover:underline">Demon Slayer</Link>, every title
            below streams with a Hindi audio option plus English sub and dub. New Hindi episodes are added as they air.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/recent"
              className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-glow-sm transition-transform hover:scale-105"
            >
              <Languages className="h-4 w-4" />
              Latest Releases
            </Link>
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-mist backdrop-blur-md transition-colors hover:border-primary-400/40 hover:text-paper"
            >
              Weekly Schedule
            </Link>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary-400" />
          <h2 className="font-display text-lg font-bold">Popular Hindi Dubbed Anime</h2>
        </div>

        {items.length > 0 ? (
          <AnimeGrid className="mt-4">
            {items.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </AnimeGrid>
        ) : (
          <p className="mt-8 text-mist">
            We're refreshing the Hindi catalog. Check back soon or{" "}
            <Link href="/browse" className="text-primary-400 hover:underline">
              browse the full catalog
            </Link>
            .
          </p>
        )}

        <div className="mt-12 max-w-3xl">
          <h2 className="font-display text-lg font-bold text-paper">What does "anime in Hindi" mean?</h2>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Hindi dubbed anime replaces the original Japanese voice track with an official Hindi audio track, so you
            can watch without reading subtitles. Anibinge streams the biggest Hindi dub titles — from battle shounen
            like <Link href="/anime/20" className="text-primary-400 hover:underline">Naruto</Link> and{" "}
            <Link href="/anime/813" className="text-primary-400 hover:underline">Dragon Ball Z</Link> to current
            seasonal hits — free, in HD, with no sign-up required. Every anime page on the site includes a Hindi audio
            toggle in the player alongside English dub and original Japanese with subtitles.
          </p>
        </div>
      </div>
    </div>
  );
}
