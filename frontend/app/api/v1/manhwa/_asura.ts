import { fetchViaCfProxy, hasCfProxy } from "@/lib/cf-proxy";

const API = "https://api.asurascans.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" };

const HEADERS = { "User-Agent": UA, "Accept": "application/json", "Referer": "https://asuracomic.net/" };

export interface ChapterData {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
  externalUrl: string | null;
}

async function fetchAsura(path: string, revalidate = 300): Promise<any> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: HEADERS,
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`Asura ${res.status}: ${path}`);
    return res.json();
  } catch {
    // Vercel datacenter IPs may be challenged by Cloudflare; route through the
    // Cloudflare Worker proxy which fetches from Cloudflare's network.
    if (hasCfProxy()) {
      const text = await fetchViaCfProxy(`${API}${path}`);
      return JSON.parse(text);
    }
    throw new Error(`Asura unreachable: ${path}`);
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return normalizeTitle(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function seriesExistsBySlug(slug: string): Promise<boolean> {
  if (!slug || slug.length < 4) return false;
  try {
    const json = await fetchAsura(`/api/series/${encodeURIComponent(slug)}/chapters`, 300);
    return Array.isArray(json?.data) && json.data.length > 0;
  } catch {
    return false;
  }
}

export async function resolveSeriesByTitle(title: string): Promise<string | null> {
  const q = normalizeTitle(title);
  if (q.length < 4) return null;
  let inclusive: string | null = null;
  try {
    const json = await fetchAsura(`/api/search?q=${encodeURIComponent(title)}`, 3600);
    const list = Array.isArray(json?.data) ? json.data : [];
    for (const item of list) {
      const candidates = [
        item?.title,
        ...(Array.isArray(item?.alt_titles) ? item.alt_titles.filter((t: any) => typeof t === "string") : []),
      ].filter((c: any): c is string => typeof c === "string" && c.length > 0);
      const norm = candidates.map(normalizeTitle).filter((c) => c.length > 0);
      if (norm.some((c) => c === q)) return item.slug;
      if (!inclusive && norm.some((c) => c.includes(q))) inclusive = item.slug;
    }
  } catch {
    // fall through to slug lookup
  }

  // Asura's search index misses some series that exist (e.g. Second Life
  // Ranker). Fall back to the slugified title (also without a leading article).
  for (const slug of [slugify(title), slugify(title.replace(/^(the|a|an)\s+/i, ""))]) {
    if (slug && (await seriesExistsBySlug(slug))) return slug;
  }
  return inclusive;
}

export async function getChapters(seriesSlug: string): Promise<{ data: ChapterData[] }> {
  const json = await fetchAsura(`/api/series/${encodeURIComponent(seriesSlug)}/chapters`, 120);
  const rows = Array.isArray(json?.data) ? json.data : [];
  const chapters: ChapterData[] = rows
    .filter((ch: any) => ch?.is_premium !== true)
    .map((ch: any) => ({
      id: `asura~${seriesSlug}~${ch.slug}`,
      chapter: ch.number != null ? String(ch.number) : "",
      title: ch.title || "",
      volume: null,
      pages: ch.page_count || 0,
      createdAt: ch.published_at || "",
      externalUrl: null,
    }));
  return { data: chapters };
}

async function extractPages(json: any): Promise<string[]> {
  return (Array.isArray(json?.data?.chapter?.pages) ? json.data.chapter.pages : [])
    .map((p: any) => (typeof p === "string" ? p : p?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
}

export async function getChapterPages(
  seriesSlug: string,
  chapterSlug: string
): Promise<{ baseUrl: string; hash: string; pages: string[] }> {
  const path = `/api/series/${encodeURIComponent(seriesSlug)}/chapters/${encodeURIComponent(chapterSlug)}`;
  let pages = await extractPages(await fetchAsura(path, 0));
  if (pages.length === 0) {
    await new Promise((r) => setTimeout(r, 500));
    pages = await extractPages(await fetchAsura(path, 0));
  }
  return { baseUrl: "", hash: "", pages };
}
