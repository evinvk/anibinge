import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SITE_URL, STUDIO_PAGES, findStudioBySlug } from "@/lib/seo";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun").replace(/^https?:\/\/anibinge\.fun(?=$|\/)/, "https://www.anibinge.fun");

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const revalidate = 86400;
export const dynamicParams = true;

async function fetchStudio(slug: string) {
  try {
    const res = await fetch(`${SITE}/api/v1/studios/${slug}?page=1`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const studio = findStudioBySlug(slug);
  if (!studio) return { title: "Studio not found" };
  return {
    title: `${studio.name} Anime — Watch All Series Online Free`,
    description: studio.intro.slice(0, 160),
    alternates: { canonical: `${SITE_URL}/studios/${studio.slug}` },
    openGraph: {
      title: `${studio.name} Anime — Watch Free on Anibinge`,
      description: studio.intro.slice(0, 160),
      url: `${SITE_URL}/studios/${studio.slug}`,
      type: "website",
    },
  };
}

export default async function StudioPage({ params }: PageProps) {
  const { slug } = await params;
  const studio = findStudioBySlug(slug);
  if (!studio) notFound();

  const data = await fetchStudio(slug);
  const items = data?.items || [];

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${studio.name} Anime`,
    url: `${SITE_URL}/studios/${studio.slug}`,
    description: studio.intro,
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

      <Link href="/studios" className="inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors">
        <Clapperboard className="h-4 w-4" />
        Studios
      </Link>

      <div className="mt-4">
        <Breadcrumbs
          siteUrl={SITE_URL}
          items={[{ label: "Studios", href: "/studios" }, { label: studio.name }]}
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{studio.name} Anime</h1>
        <p className="mt-3 text-sm leading-relaxed text-mist">{studio.intro}</p>
      </div>

      {items.length > 0 ? (
        <AnimeGrid className="mt-8">
          {items.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </AnimeGrid>
      ) : (
        <p className="mt-8 text-mist">
          We're collecting the {studio.name} catalog. Check back soon or{" "}
          <Link href="/browse" className="text-primary-400 hover:underline">browse all anime</Link>.
        </p>
      )}
    </div>
  );
}
