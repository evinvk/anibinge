import { fetchViaCfProxy, hasCfProxy } from "@/lib/cf-proxy";

const BASE = "https://weebcentral.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" };

const HEADERS = { "User-Agent": UA, "Accept": "text/html,*/*" };

export interface ChapterData {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
  externalUrl: string | null;
}

export interface SeriesRef {
  id: string;
  title: string;
}

async function fetchHtml(path: string, revalidate = 300): Promise<string> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: HEADERS,
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`WeebCentral ${res.status}: ${path}`);
    return res.text();
  } catch {
    // Vercel datacenter IPs may be challenged by Cloudflare; route through the
    // Cloudflare Worker proxy which fetches from Cloudflare's network.
    if (hasCfProxy()) {
      return fetchViaCfProxy(`${BASE}${path}`);
    }
    throw new Error(`WeebCentral unreachable: ${path}`);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSearchResults(html: string): SeriesRef[] {
  const results: SeriesRef[] = [];
  const re = /<a href="https:\/\/weebcentral\.com\/series\/([A-Za-z0-9]+)\/[^"]*"[^>]*class="line-clamp-1 link link-hover"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] === "random") continue;
    const title = decodeEntities(m[2]).trim();
    if (!title) continue;
    results.push({ id: m[1], title });
  }
  return results.filter((r, i) => results.findIndex((o) => o.id === r.id) === i);
}

export async function resolveSeriesByTitle(title: string): Promise<SeriesRef | null> {
  const q = normalizeTitle(title);
  if (q.length < 4) return null;
  for (const query of searchQueries(title)) {
    try {
      const html = await fetchHtml(`/search/data?text=${encodeURIComponent(query)}`, 3600);
      const results = parseSearchResults(html);
      if (results.length === 0) continue;
      for (const r of results) if (normalizeTitle(r.title) === q) return r;
      for (const r of results) if (normalizeTitle(r.title).includes(q)) return r;
      if (query === title) return results[0];
    } catch {
      continue;
    }
  }
  return null;
}

// WeebCentral's search AND-matches whole tokens and chokes on apostrophes
// (e.g. "Returner's Magic" returns nothing while "Returner" or "Magic Should Be
// Special" work). Generate candidate queries from most to least specific so a
// single distinctive keyword still resolves the series.
function searchQueries(title: string): string[] {
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t) seen.add(t);
  };
  push(title);
  const deArt = title.replace(/^(the|a|an)\s+/i, "").trim();
  push(deArt);
  const words = deArt.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  push(words.join(" "));
  if (words.length > 3) push(words.slice(0, 3).join(" "));
  if (words.length > 2) push(words.slice(0, 2).join(" "));
  if (words.length > 3) push(words.slice(-3).join(" "));
  if (words.length > 2) push(words.slice(-2).join(" "));
  for (const w of [...words].sort((a, b) => b.length - a.length)) if (w.length >= 4) push(w);
  return [...seen];
}

export async function getChapters(seriesId: string): Promise<{ data: ChapterData[] }> {
  const html = await fetchHtml(`/series/${encodeURIComponent(seriesId)}/full-chapter-list`, 300);
  const chapters: ChapterData[] = [];
  const re = /<a href="\/chapters\/([A-Za-z0-9]+)"[^>]*>[\s\S]*?<span class="">([^<]+)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const chapterId = m[1];
    const name = decodeEntities(m[2]).trim();
    const numMatch = name.match(/\d+(?:\.\d+)?/);
    chapters.push({
      id: `wc~${seriesId}~${chapterId}`,
      chapter: numMatch ? numMatch[0] : "",
      title: name,
      volume: null,
      pages: 0,
      createdAt: "",
      externalUrl: null,
    });
  }
  return { data: chapters };
}

export async function getChapterPages(
  seriesId: string,
  chapterId: string
): Promise<{ baseUrl: string; hash: string; pages: string[] }> {
  const html = await fetchHtml(`/chapters/${encodeURIComponent(chapterId)}/images?is_prev=False`, 300);
  const pages: string[] = [];
  const re = /<img[^>]+src="(https?:\/\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (url.includes("weebcentral.com/static")) continue;
    if (pages.includes(url)) continue;
    pages.push(url);
  }
  return { baseUrl: "", hash: "", pages };
}
