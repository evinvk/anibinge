import { fetchViaCfProxy, hasCfProxy } from "@/lib/cf-proxy";
import { cachedFetch } from "@/lib/ttl-cache";

const GOGO_BASE = "https://gogoanimehd.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const JINA = "https://r.jina.ai";
const JINA_TIMEOUT = 20000;

function stripJinaWrapper(body: string): string {
  const preStart = body.indexOf("<pre");
  const preEnd = body.lastIndexOf("</pre>");
  let raw = body;
  if (preStart >= 0 && preEnd > preStart) {
    const openTagEnd = body.indexOf(">", preStart);
    raw = body.slice(openTagEnd + 1, preEnd);
  }
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function fetchGogoApi(path: string, timeoutMs = 10000): Promise<any> {
  return cachedFetch(`gogo:${path}`, 120000, () => fetchGogoApiFresh(path, timeoutMs), 60000);
}

async function fetchGogoApiFresh(path: string, timeoutMs: number): Promise<any> {
  const url = `${GOGO_BASE}${path}`;

  // Try direct first
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Referer: `${GOGO_BASE}/` },
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) return resp.json();
  } catch {}

  // Fallback to CF Worker proxy
  if (hasCfProxy()) {
    try {
      const text = await fetchViaCfProxy(url, timeoutMs);
      return JSON.parse(text);
    } catch {}
  }

  // Fallback to Jina reader proxy (bypasses Cloudflare)
  try {
    const resp = await fetch(`${JINA}/${url}`, {
      headers: { "User-Agent": UA, "X-Return-Format": "html" },
      signal: AbortSignal.timeout(JINA_TIMEOUT),
    });
    if (!resp.ok) throw new Error(`Jina ${resp.status}`);
    const text = await resp.text();
    return JSON.parse(stripJinaWrapper(text));
  } catch (e: any) {
    throw new Error(`GogoAnime unreachable: ${e.message}`);
  }
}

async function searchGogoAnime(query: string): Promise<any[]> {
  const data = await fetchGogoApi(`/api/search/live?q=${encodeURIComponent(query)}`);
  return Array.isArray(data) ? data : data?.data || [];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function resolveGogoSlug(slug: string): Promise<string> {
  const episodeData = await fetchGogoApi(`/api/episode/${slug}/ep-1`).catch(() => null);
  if (episodeData?.animeId) return slug;

  const searchQuery = slug.replace(/-/g, " ");
  const results = await searchGogoAnime(searchQuery).catch(() => []);

  for (const r of results) {
    if (r.slug && slugify(r.title) === slugify(searchQuery)) return r.slug;
  }
  for (const r of results) {
    const rSlugBase = r.slug?.replace(/-[a-z0-9]{5}$/, "") || "";
    if (r.slug && (slug.startsWith(rSlugBase) || rSlugBase.startsWith(slug))) return r.slug;
  }
  for (const r of results) {
    if (r.slug && slugify(r.title).includes(slugify(searchQuery).slice(0, 8))) return r.slug;
  }
  if (results.length > 0 && results[0].slug) return results[0].slug;

  return slug;
}

export { GOGO_BASE, UA };
