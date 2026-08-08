import type { MetadataRoute } from "next";
import { SITE_URL, getSeasonPages, STUDIO_PAGES, episodeUploadDate } from "@/lib/seo";

// Prerender the sitemap at build time and serve it as a static file (with ISR
// refresh every 6h). Static files always respond instantly with 200 — no
// serverless function execution that could time out or fail on a cold start,
// which is what Google's "Couldn't fetch" hit before.
export const dynamic = "force-static";
export const revalidate = 21600; // regenerate every 6h (catalog churns daily)

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun";

const MAX_EPISODE_URLS_PER_TITLE = 24;
const MAX_TITLES_FROM_GOGO = 60;

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/anime`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/donghua`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/sitemap`, changeFrequency: "weekly", priority: 0.2 },
  ];

  // Season hubs: /season/{winter-2026} etc. (long-tail: "[anime] season N" clusters)
  for (const s of getSeasonPages()) {
    urls.push({ url: `${SITE_URL}/season/${s.slug}`, changeFrequency: "daily", priority: 0.6 });
  }

  // Studio hubs
  for (const s of STUDIO_PAGES) {
    urls.push({ url: `${SITE_URL}/studios/${s.slug}`, changeFrequency: "weekly", priority: 0.4 });
  }

  // Anime topic-cluster hubs: /anime/{id} (from MAL top-rated + trending)
  // All catalog fetches run in parallel so even the cold-start sitemap build
  // stays fast — a slow sequential build is what made Google's fetch fail.
  const [rated1, rated2, trending, latest1, latest2, latest3, donghuaRes] = await Promise.all([
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=1`, 8000),
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=2`, 8000),
    fetchJson(`${API_BASE}/api/v1/anime/trending?page=1`, 8000),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=1`, 8000),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=2`, 8000),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=3`, 8000),
    fetchJson(`${API_BASE}/api/v1/donghua/browse?page=1`, 8000),
  ]);

  const animeIds = new Set<number>();
  for (const res of [rated1, rated2, trending]) {
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const a of list) {
      const id = Number(a?.id ?? a?.mal_id ?? a?.anilist_id);
      if (Number.isInteger(id) && id > 0) animeIds.add(id);
    }
  }
  for (const id of animeIds) {
    urls.push({ url: `${SITE_URL}/anime/${id}`, changeFrequency: "weekly", priority: 0.7 });
  }

  // Episode-level landing pages: /watch/{slug}?ep=N for recent catalog titles.
  // These are the "[anime] episode N" long-tail pages. Capped per title to keep
  // the sitemap lean — Google crawls the freshest episodes, not all 1000+.
  const slugSet = new Map<string, { episodes: number; latest: number }>();
  for (const res of [latest1, latest2, latest3]) {
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const a of list) {
      if (slugSet.size >= MAX_TITLES_FROM_GOGO) break;
      if (a?.slug && !slugSet.has(a.slug)) {
        const eps = Number(a?.episodes_count) || 0;
        const latest = Number(a?.latest_episode) || 0;
        if (eps > 0 || latest > 0) slugSet.set(a.slug, { episodes: Math.max(eps, latest), latest });
      }
    }
    if (slugSet.size >= MAX_TITLES_FROM_GOGO) break;
  }

  for (const [slug, { episodes }] of slugSet) {
    const count = Math.min(episodes, MAX_EPISODE_URLS_PER_TITLE);
    for (let ep = 1; ep <= count; ep++) {
      urls.push({
        url: `${SITE_URL}/watch/${slug}?ep=${ep}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: episodeUploadDate(slug, ep), // matches the page's VideoObject uploadDate
      });
    }
  }

  // Donghua catalog hubs
  const donghuaList = Array.isArray(donghuaRes?.data) ? donghuaRes.data : [];
  for (const d of donghuaList) {
    if (d?.slug) urls.push({ url: `${SITE_URL}/donghua/${d.slug}`, changeFrequency: "weekly", priority: 0.5 });
  }

  return urls;
}
