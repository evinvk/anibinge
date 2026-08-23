import type { Metadata } from "next";
import Link from "next/link";
import { Languages } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { HindiAnimeGrid } from "@/components/hindi-anime-grid";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

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

export default function HindiAnimePage() {
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

        <HindiAnimeGrid />

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
