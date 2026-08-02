import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { GENRE_PAGES, findGenreBySlug } from "@/lib/genre-seo";
import { api } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { Breadcrumbs } from "@/components/breadcrumbs";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

interface PageProps {
  params: Promise<{ genre: string }>;
}

export function generateStaticParams() {
  return GENRE_PAGES.map((g) => ({ genre: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { genre } = await params;
  const g = findGenreBySlug(genre);
  if (!g) return { title: "Genre not found" };
  return {
    title: `${g.name} Anime — Watch Online Free, Full Episodes`,
    description: g.intro.slice(0, 160),
    openGraph: {
      title: `Watch ${g.name} Anime Online Free — Anibinge`,
      description: g.intro.slice(0, 160),
      url: `${SITE_URL}/genres/${g.slug}`,
      type: "website",
    },
    alternates: { canonical: `${SITE_URL}/genres/${g.slug}` },
  };
}

export const dynamic = "force-static";
export const revalidate = 86400;

async function fetchGenreAnime(genre: string) {
  try {
    const res = await api.search("anime", {
      genres: genre,
      order_by: "popularity",
      sort: "desc",
    });
    return (res.data || []).filter((a: any) => a?.id && a?.title);
  } catch {
    return [];
  }
}

export default async function GenrePage({ params }: PageProps) {
  const { genre } = await params;
  const g = findGenreBySlug(genre);
  if (!g) notFound();

  const items = await fetchGenreAnime(g.name);

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${g.name} Anime — Watch Online Free`,
    url: `${SITE_URL}/genres/${g.slug}`,
    description: g.intro,
    isPartOf: {
      "@type": "WebSite",
      name: "Anibinge",
      url: SITE_URL,
    },
    hasPart: items.slice(0, 12).map((a: any) => ({
      "@type": "TVSeries",
      name: a.title_english || a.title,
      url: `${SITE_URL}/anime/${a.id}`,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }}
      />

      <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Browse Anime
      </Link>

      <div className="mt-4">
        <Breadcrumbs
          siteUrl={SITE_URL}
          items={[{ label: "Browse", href: "/browse" }, { label: `${g.name} Anime` }]}
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{g.name} Anime</h1>
        <p className="mt-4 text-sm leading-relaxed text-mist">{g.intro}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {GENRE_PAGES.slice(0, 14).map((other) => (
          <Link
            key={other.slug}
            href={`/genres/${other.slug}`}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              other.slug === g.slug
                ? "bg-primary-600/30 text-primary-300"
                : "bg-white/5 border border-white/10 text-mist hover:border-primary-400/30 hover:text-paper"
            }`}
          >
            {other.name}
          </Link>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-400" />
        <h2 className="font-display text-lg font-bold">Popular {g.name} Titles</h2>
        <Link
          href={`/browse?genres=${encodeURIComponent(g.name)}`}
          className="ml-auto inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300"
        >
          Browse all {g.name}
        </Link>
      </div>

      {items.length > 0 ? (
        <AnimeGrid className="mt-4">
          {items.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </AnimeGrid>
      ) : (
        <p className="mt-8 text-mist">
          We're refreshing titles in this genre. Check back soon or{" "}
          <Link href="/browse" className="text-primary-400 hover:underline">
            browse the full catalog
          </Link>
          .
        </p>
      )}
    </div>
  );
}
