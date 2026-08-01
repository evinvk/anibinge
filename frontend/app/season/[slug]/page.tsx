import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  SITE_URL,
  SEASON_PAGES,
  parseSeasonSlug,
  seasonLabel,
  buildSeasonSlug,
  SEASON_NAMES,
} from "@/lib/seo";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const now = new Date();
const curM = now.getMonth() + 1;
const curY = now.getFullYear();
const curSeason = curM <= 2 || curM === 12 ? "winter" : curM <= 5 ? "spring" : curM <= 8 ? "summer" : "fall";

export function generateStaticParams() {
  return [{ slug: buildSeasonSlug(curSeason, curY) }];
}

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) return { title: "Season not found" };
  const { season, year } = parsed;
  const label = seasonLabel(season, year);
  return {
    title: `${label} Anime Lineup — Watch New Releases Free`,
    description: `Browse the full ${label} anime lineup. New episodes, sequels, and premieres streaming free in HD with sub and dub on Anibinge.`,
    keywords: [`${label} anime`, `${label} 2026 anime schedule`, `new anime ${year}`],
    alternates: { canonical: `${SITE_URL}/season/${slug}` },
    openGraph: {
      title: `${label} Anime — New Episodes Streaming Free`,
      description: `Browse the ${label} anime lineup and stream new episodes free in HD.`,
      url: `${SITE_URL}/season/${slug}`,
      type: "website",
    },
  };
}

export default async function SeasonPage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) notFound();
  const { season, year } = parsed;
  const label = seasonLabel(season, year);
  const seo = SEASON_PAGES.find((s) => s.slug === slug);

  let items: any[] = [];
  try {
    const res = await api.season(year, season, 1);
    items = (res.data || []).filter((a: any) => a?.id && a?.title);
  } catch {}

  const seasonIndex = SEASON_NAMES.indexOf(season as any);

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${label} Anime`,
    url: `${SITE_URL}/season/${slug}`,
    description: seo?.intro,
    isPartOf: { "@type": "WebSite", name: "Anibinge", url: SITE_URL },
    hasPart: items.slice(0, 12).map((a: any) => ({
      "@type": "TVSeries",
      name: a.title_english || a.title,
      url: `${SITE_URL}/anime/${a.id}`,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />

      <Link href="/seasonal" className="inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors">
        <CalendarDays className="h-4 w-4" />
        Seasonal Anime
      </Link>

      <div className="mt-4">
        <Breadcrumbs
          siteUrl={SITE_URL}
          items={[{ label: "Seasonal", href: "/seasonal" }, { label }]}
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{label} Anime</h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">{seo?.intro}</p>
      </div>

      <nav className="mt-6 flex flex-wrap items-center gap-2" aria-label="Season navigation">
        {SEASON_NAMES.map((s, i) => {
          const dYear = year + Math.floor((i - seasonIndex) / 4);
          const dSeason = SEASON_NAMES[((i - seasonIndex) % 4 + 4) % 4];
          const target = buildSeasonSlug(dSeason, dYear);
          const current = s === season;
          return (
            <Link
              key={s}
              href={`/season/${target}`}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                current
                  ? "bg-primary-600/30 text-primary-300"
                  : "bg-white/5 border border-white/10 text-mist hover:border-primary-400/30 hover:text-paper"
              }`}
            >
              {seasonLabel(s, dYear)}
            </Link>
          );
        })}
      </nav>

      {items.length > 0 ? (
        <AnimeGrid className="mt-8">
          {items.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </AnimeGrid>
      ) : (
        <p className="mt-8 text-mist">
          We're refreshing the lineup for this season. Check back soon or{" "}
          <Link href="/browse" className="text-primary-400 hover:underline">browse the full catalog</Link>.
        </p>
      )}
    </div>
  );
}
