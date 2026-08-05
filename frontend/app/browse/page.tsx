import type { Metadata } from "next";
import Link from "next/link";
import { BrowseFilters } from "@/components/browse-filters";
import { InfiniteAnimeGrid } from "@/components/infinite-anime-grid";
import { CatalogCard, CatalogGrid } from "@/components/catalog-card";
import { Pagination } from "@/components/pagination";
import { SITE_URL } from "@/lib/seo";
import { GENRE_PAGES } from "@/lib/genre-seo";
import type { GogoAnimeItem } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
const CATALOG_TOTAL_PAGES = 297;

interface BrowsePageProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

function buildBrowseHref(page: number, params: URLSearchParams): string {
  const qs = new URLSearchParams(params);
  if (page > 1) qs.set("page", String(page));
  else qs.delete("page");
  const s = qs.toString();
  return s ? `/browse?${s}` : "/browse";
}

export async function generateMetadata({ searchParams }: BrowsePageProps): Promise<Metadata> {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const isCatalog = !(params.q || params.genres || params.status || params.type || params.order_by || params.sort || params.year || params.season);

  if (isCatalog) {
    const canonical = new URLSearchParams();
    if (page > 1) canonical.set("page", String(page));
    const url = `${SITE_URL}/browse${canonical.size ? `?${canonical.toString()}` : ""}`;
    const title = page === 1 ? "Browse Anime by Genre, Season & Studio" : `Browse Anime — Page ${page} of ${CATALOG_TOTAL_PAGES}`;
    const description =
      page === 1
        ? "Browse thousands of anime to watch online free. Filter by genre, season, studio, status, and more. Find your next favorite show to stream."
        : `Browse the full anime catalog — page ${page} of ${CATALOG_TOTAL_PAGES}. Watch popular and latest anime online free in HD on Anibinge.`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        siteName: "Anibinge",
        type: "website",
        images: [{ url: "/og.svg", width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/og.svg"],
      },
    };
  }

  const canonicalParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) canonicalParams.set(k, v);
  }
  return {
    title: params.status === "upcoming" ? "Upcoming Anime" : "Browse Anime",
    alternates: {
      canonical: `${SITE_URL}/browse${canonicalParams.size ? `?${canonicalParams.toString()}` : ""}`,
    },
  };
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const query = params.q || "anime";
  const hasSearchOrFilter = !!(params.q || params.genres || params.status || params.type || params.order_by || params.sort || params.year || params.season);

  const filters: Record<string, string> = {
    ...(params.genres ? { genres: params.genres } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.order_by ? { order_by: params.order_by } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
    ...(params.year ? { year: params.year } : {}),
    ...(params.season ? { season: params.season } : {}),
  };

  let catalogItems: GogoAnimeItem[] = [];
  let catalogLoaded = false;

  if (!hasSearchOrFilter) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=${page}`, {
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const json = await res.json();
        catalogItems = json.data || [];
        catalogLoaded = true;
      }
    } catch {}
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">
        {params.status === "upcoming" ? "Upcoming Anime" : "Browse"}
      </h1>
      <p className="mt-1 text-mist">
        {params.status === "upcoming"
          ? "Anime scheduled to air soon."
          : "Search and filter across the full anime catalog."}
      </p>

      <BrowseFilters />

      {!hasSearchOrFilter && catalogLoaded ? (
        <>
          <CatalogGrid className="mt-8">
            {catalogItems.map((item, i) => (
              <CatalogCard key={`${item.slug}-${i}`} item={item} priority={page === 1 && i < 6} />
            ))}
          </CatalogGrid>
          <Pagination
            currentPage={page}
            totalPages={CATALOG_TOTAL_PAGES}
            buildHref={(p) => buildBrowseHref(p, new URLSearchParams())}
          />
        </>
      ) : (
        <InfiniteAnimeGrid initialItems={[]} query={query} filters={filters} />
      )}

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold">Browse by Genre</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {GENRE_PAGES.map((g) => (
            <Link
              key={g.slug}
              href={`/genres/${g.slug}`}
              className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-primary-400/30 hover:text-paper"
            >
              {g.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
