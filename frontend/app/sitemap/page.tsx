import type { Metadata } from "next";
import Link from "next/link";
import { Map } from "lucide-react";
import { SITE_URL, getSeasonPages, STUDIO_PAGES } from "@/lib/seo";
import { GENRE_PAGES } from "@/lib/genre-seo";
import { HINDI_ANIME } from "@/lib/hindi-seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sitemap — Browse All Anime Pages",
  description:
    "Browse every page on Anibinge: anime genres, seasonal lineups, studios, Hindi dubbed anime, news, schedule, and downloads — all in one index.",
  alternates: { canonical: `${SITE_URL}/sitemap` },
};

const MAIN_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse Anime" },
  { href: "/seasonal", label: "Seasonal Anime" },
  { href: "/schedule", label: "Anime Schedule" },
  { href: "/recent", label: "Latest Releases" },
  { href: "/studios", label: "Anime Studios" },
  { href: "/news", label: "Anime News" },
  { href: "/search", label: "Search Anime" },
  { href: "/donghua", label: "Donghua" },
  { href: "/manhwa", label: "Manhwa" },
  { href: "/hindi-anime", label: "Hindi Dubbed Anime" },
  { href: "/watchlist", label: "My Watchlist" },
  { href: "/profile", label: "My Profile" },
  { href: "/login", label: "Log In" },
  { href: "/signup", label: "Sign Up" },
];

export default function SitemapPage() {
  const seasonPages = getSeasonPages();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mt-6 flex items-center gap-2">
        <Map className="h-5 w-5 text-primary-400" />
        <h1 className="font-display text-3xl font-bold">Sitemap</h1>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
        Every page on Anibinge in one place. Pick a genre, season, studio, or Hindi-dubbed title
        below to jump straight to the content you want to watch.
      </p>

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="font-display text-lg font-semibold text-paper">Main Pages</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {MAIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-paper">Genres</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {GENRE_PAGES.map((g) => (
              <Link
                key={g.slug}
                href={`/genres/${g.slug}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
              >
                {g.name}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-paper">Seasons</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {seasonPages.map((s) => (
              <Link
                key={s.slug}
                href={`/season/${s.slug}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-paper">Studios</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {STUDIO_PAGES.map((s) => (
              <Link
                key={s.slug}
                href={`/studios/${s.slug}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-paper">Hindi Dubbed Anime</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {HINDI_ANIME.map((h) => (
              <Link
                key={h.anilistId}
                href={`/anime/${h.anilistId}`}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
              >
                {h.title}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
