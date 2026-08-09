import type { MetadataRoute } from "next";
import { SITE_URL, getSeasonPages, STUDIO_PAGES, episodeUploadDate } from "@/lib/seo";
import { GENRE_PAGES } from "@/lib/genre-seo";
import { HINDI_ANIME } from "@/lib/hindi-seo";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.anibinge.fun";

const MAX_EPISODE_URLS_PER_TITLE = 48;
const MAX_TITLES_FROM_GOGO = 120;

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function buildSitemapUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/anime`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/seasonal`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/schedule`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/recent`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/studios`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/search`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/donghua`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/manhwa`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/hindi-anime`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/sitemap`, changeFrequency: "weekly", priority: 0.2 },
  ];

  for (const g of GENRE_PAGES) {
    urls.push({ url: `${SITE_URL}/genres/${g.slug}`, changeFrequency: "weekly", priority: 0.6 });
  }

  for (const s of getSeasonPages()) {
    urls.push({ url: `${SITE_URL}/season/${s.slug}`, changeFrequency: "daily", priority: 0.6 });
  }

  for (const s of STUDIO_PAGES) {
    urls.push({ url: `${SITE_URL}/studios/${s.slug}`, changeFrequency: "weekly", priority: 0.4 });
  }

  for (const h of HINDI_ANIME) {
    urls.push({ url: `${SITE_URL}/anime/${h.anilistId}?source=anilist`, changeFrequency: "weekly", priority: 0.6 });
  }

  const [rated1, rated2, rated3, rated4, rated5, trending, airing, upcoming, latest1, latest2, latest3, latest4, latest5, latest6, donghua1, donghua2, donghua3] = await Promise.all([
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=1`),
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=2`),
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=3`),
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=4`),
    fetchJson(`${API_BASE}/api/v1/anime/top-rated?page=5`),
    fetchJson(`${API_BASE}/api/v1/anime/trending?page=1`),
    fetchJson(`${API_BASE}/api/v1/anime/airing?page=1`),
    fetchJson(`${API_BASE}/api/v1/anime/upcoming?page=1`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=1`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=2`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=3`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=4`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=5`),
    fetchJson(`${API_BASE}/api/v1/streaming/gogoanime/latest?page=6`),
    fetchJson(`${API_BASE}/api/v1/donghua/browse?page=1`),
    fetchJson(`${API_BASE}/api/v1/donghua/browse?page=2`),
    fetchJson(`${API_BASE}/api/v1/donghua/browse?page=3`),
  ]);

  const animeIds = new Set<number>();
  for (const res of [rated1, rated2, rated3, rated4, rated5, trending, airing, upcoming]) {
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const a of list) {
      const id = Number(a?.id ?? a?.mal_id ?? a?.anilist_id);
      if (Number.isInteger(id) && id > 0) animeIds.add(id);
    }
  }
  for (const id of animeIds) {
    urls.push({ url: `${SITE_URL}/anime/${id}`, changeFrequency: "weekly", priority: 0.7 });
  }

  const slugSet = new Map<string, { episodes: number; latest: number }>();
  for (const res of [latest1, latest2, latest3, latest4, latest5, latest6]) {
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
        url: `${SITE_URL}/watch/${slug}/episode-${ep}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: episodeUploadDate(slug, ep),
      });
    }
  }

  for (const res of [donghua1, donghua2, donghua3]) {
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const d of list) {
      if (d?.slug) {
        urls.push({ url: `${SITE_URL}/donghua/${d.slug}`, changeFrequency: "weekly", priority: 0.5 });
        if (d?.episodes) {
          const count = Math.min(Number(d.episodes), 200);
          for (let ep = 1; ep <= count; ep++) {
            urls.push({
              url: `${SITE_URL}/donghua/watch/${d.slug}/episode-${ep}`,
              changeFrequency: "weekly",
              priority: 0.5,
              lastModified: episodeUploadDate(d.slug, ep),
            });
          }
        }
      }
    }
  }

  // Manhwa chapters
  try {
    const manhwaRes = await fetchJson(`${API_BASE}/api/v1/manhwa/browse?page=1`);
    const manhwaList = Array.isArray(manhwaRes?.data) ? manhwaRes.data : [];
    for (const m of manhwaList) {
      if (m?.slug && m?.chapters) {
        urls.push({ url: `${SITE_URL}/manhwa/${m.slug}`, changeFrequency: "weekly", priority: 0.5 });
        const count = Math.min(Number(m.chapters), 500);
        for (let ch = 1; ch <= count; ch++) {
          urls.push({
            url: `${SITE_URL}/manhwa/read/${m.slug}/chapter-${ch}`,
            changeFrequency: "weekly",
            priority: 0.5,
          });
        }
      }
    }
  } catch {}

  return urls;
}
