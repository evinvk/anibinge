import { fetchViaCfProxy } from "@/lib/cf-proxy";

export const BASE = "https://animexin.dev";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function abs(url: string): string {
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return url;
}

function parseMarkdownLine(line: string): any | null {
  const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!linkMatch) return null;
  const fullText = linkMatch[1];
  const url = linkMatch[2].replace(/".*$/, "").trim();
  if (!url || url === "#" || url.startsWith("http://animexin.dev/#")) return null;

  const imgMatch = fullText.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const poster = imgMatch ? imgMatch[1] : "";

  const epMatch = fullText.match(/Ep(?:isode)?\s*(\d+)/i);
  const episode = epMatch ? parseInt(epMatch[1]) : null;

  const subMatch = fullText.match(/^(Sub|Dub)\b/i);
  const subType = subMatch ? subMatch[1] : "Sub";

  const typeMatch = fullText.match(/\b(ONA|Movie|OVA|Special|TV)\b/i);
  const mediaType = typeMatch ? typeMatch[1] : "ONA";

  let title = "";
  const afterImg = fullText.replace(/!\[[^\]]*\]\([^)]+\)\s*/, "");
  const hashSplit = afterImg.split("##");
  if (hashSplit.length > 1) {
    title = hashSplit[0]
      .replace(/^(Sub|Dub)\s+/i, "")
      .replace(/\s+(ONA|Movie|OVA|Special|TV)\b.*$/i, "")
      .replace(/\s+Ep(?:isode)?\s*\d+.*$/i, "")
      .trim();
    if (!title) title = hashSplit[1].trim();
  } else {
    title = afterImg.trim();
  }
  title = title.replace(/\[[^\]]*\]$/, "").trim();

  if (!title) {
    const textParts = fullText.split("##");
    if (textParts.length > 1) {
      title = textParts[textParts.length - 1].trim();
    }
  }

  title = title.replace(/^\d+\s+/, "").replace(/\s*\[.*$/, "").trim();
  if (!title) {
    const urlParts = url.replace(/\/$/, "").split("/");
    title = decodeURIComponent(urlParts[urlParts.length - 1] || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  let slug = url.replace(/\/$/, "").split("/").pop() || "";
  slug = slug.replace(/-episode-\d+.*$/, "").replace(/-(?:indonesia|english|subtitle).*$/i, "");

  return { slug, title, poster, episode, sub_type: subType, type: mediaType, url: abs(url) };
}

export function parseHomepageFromMarkdown(text: string) {
  const popular: any[] = [];
  const latest: any[] = [];
  const lines = text.split("\n");
  let section: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      const header = trimmed.replace(/^#+\s*/, "").toLowerCase();
      if (header.includes("popular")) section = "popular";
      else if (header.includes("latest") || header.includes("release")) section = "latest";
      else if (header.includes("recommendation") || header.includes("blog")) section = null;
      else section = null;
      continue;
    }
    if (!section || !trimmed.startsWith("[")) continue;

    const item = parseMarkdownLine(trimmed);
    if (item && item.title) {
      if (section === "popular") popular.push(item);
      else if (section === "latest") latest.push(item);
    }
  }

  return { popular, latest };
}

export function parseCardsFromMarkdown(text: string): any[] {
  const items: any[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    if (/^\[(Next|Prev|View All|1|2|3)\]/.test(trimmed)) continue;
    const item = parseMarkdownLine(trimmed);
    if (item && item.title) items.push(item);
  }
  return items;
}

async function fetchViaJina(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const targetUrl = BASE + path + qs;
  const proxyUrl = `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//, "")}`;
  const resp = await fetch(proxyUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/plain",
    },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 3600 },
  });
  if (!resp.ok) throw new Error(`Jina AI ${resp.status}`);
  const text = await resp.text();
  const mdMatch = text.match(/Markdown Content:\s*\n([\s\S]*)/);
  return mdMatch ? mdMatch[1].trim() : text;
}

const htmlCache = new Map<string, { html: string; at: number }>();
const HTML_TTL_MS = 60 * 60 * 1000;

export async function fetchHtml(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const key = path + qs;

  const cached = htmlCache.get(key);
  if (cached && Date.now() - cached.at < HTML_TTL_MS) return cached.html;

  const errors: string[] = [];

  // Try Jina first (returns markdown, works reliably in CF Workers)
  try {
    const md = await fetchViaJina(path, params);
    if (md?.length > 50) {
      htmlCache.set(key, { html: md, at: Date.now() });
      return md;
    }
  } catch (e: any) {
    errors.push(e.message || "Jina AI failed");
  }

  // Fallback: AllOrigins proxy
  const url = BASE + path + qs;
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
    if (r.ok) {
      const text = await r.text();
      if (text?.length > 100) {
        htmlCache.set(key, { html: text, at: Date.now() });
        return text;
      }
    }
    errors.push(`AllOrigins ${r.status}`);
  } catch (e: any) {
    errors.push(e.message || "AllOrigins failed");
  }

  // Fallback: Cloudflare Worker proxy
  try {
    const html = await fetchViaCfProxy(url);
    if (html?.length > 100) {
      htmlCache.set(key, { html, at: Date.now() });
      return html;
    }
  } catch (e: any) {
    errors.push(e.message || "CF Proxy failed");
  }

  throw new Error(`AnimeXin fetch failed: ${errors.join(", ")}`);
}

function parseWpPost(p: any) {
  const slug: string = p.slug || "";
  const epMatch = slug.match(/-episode-(\d+)/i);
  const episode = epMatch ? parseInt(epMatch[1]) : null;
  let title = (p.title?.rendered || "").replace(/<[^>]+>/g, "").trim();
  const cleanTitle = title.replace(/\s+Episode\s*\d+[^]*$/i, "").trim();
  let poster = "";
  const oh: string = p.yoast_head || "";
  const om = oh.match(/property="og:image"\s+content="([^"]+)"/);
  if (om) poster = om[1];
  let cleanSlug = slug.replace(/-episode-\d+.*$/i, "");
  cleanSlug = cleanSlug.replace(/-(?:indonesia|english|subtitle|subbed?|dubbed?)(?:-|$).*$/i, "");
  const dateRaw: string = p.date_gmt || p.date || "";
  const releasedAt = dateRaw ? dateRaw.replace(/Z$/, "") + "Z" : null;
  return {
    slug: cleanSlug,
    title: cleanTitle || title,
    poster,
    episode,
    sub_type: "Sub",
    type: "ONA",
    url: p.link || `${BASE}/${slug}/`,
    released_at: releasedAt,
  };
}

export async function fetchLatestWp(page = 1): Promise<any[] | null> {
  const url = `${BASE}/wp-json/wp/v2/posts?per_page=30&page=${page}`;
  let data: any = null;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const j = await resp.json();
      if (Array.isArray(j)) data = j;
    }
  } catch {
    data = null;
  }
  if (!data) {
    try {
      const text = await fetchViaCfProxy(url);
      const j = JSON.parse(text);
      if (Array.isArray(j)) data = j;
    } catch {
      data = null;
    }
  }
  if (!Array.isArray(data) || !data.length) return null;
  const items = data.map(parseWpPost).filter((i: any) => i.slug && i.title);
  return items.length ? items : null;
}

export function parseDetailFromMarkdown(text: string, slug: string) {
  const lines = text.split("\n");

  let title = slug;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) { title = m[1].trim(); break; }
  }

  let poster = "";
  for (const line of lines) {
    const m = line.match(/!\[.*?\]\(([^)]+)\)/);
    if (m) { poster = abs(m[1]); break; }
  }

  let score: number | null = null;
  for (const line of lines) {
    const m = line.match(/\*\*Rating\s*([\d.]+)\*\*/);
    if (m) { score = parseFloat(m[1]); break; }
  }

  const meta: Record<string, string> = {};
  const metaLine = lines.find(l => l.includes("**Status:**") && l.includes("**Type:**"));
  if (metaLine) {
    const parts = metaLine.split("**").filter(Boolean);
    for (let i = 0; i < parts.length; i += 2) {
      const key = parts[i].replace(/:$/, "").trim().toLowerCase();
      const val = parts[i + 1] ? parts[i + 1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim() : "";
      if (key) meta[key] = val;
    }
  }

  const genres: string[] = [];
  for (const line of lines) {
    if (line.includes("https://animexin.dev/genres/")) {
      const genreMatches = line.matchAll(/\[([^\]]+)\]\(https:\/\/animexin\.dev\/genres\/[^)]+\)/g);
      for (const gm of genreMatches) {
        const g = gm[1].trim();
        if (g && !genres.includes(g)) genres.push(g);
      }
      if (genres.length > 0) break;
    }
  }

  let description = "";
  let inSynopsis = false;
  for (const line of lines) {
    if (/^##\s+Synopsis/i.test(line)) { inSynopsis = true; continue; }
    if (inSynopsis) {
      if (/^##\s/.test(line)) break;
      const clean = line.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
      if (clean && !clean.startsWith("[") && !clean.startsWith("!")) description += clean + " ";
    }
  }
  description = description.trim();

  const episodeList: any[] = [];
  let inEpisodes = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###?\s+Watch/i.test(trimmed)) { inEpisodes = true; continue; }
    if (inEpisodes && /^###?\s/.test(trimmed)) break;
    if (!inEpisodes) continue;
    const itemMatch = trimmed.match(/^\*\s+\[(\d+)\s+(.+?)\]\(([^)]+)\)/);
    if (itemMatch) {
      const epNum = parseInt(itemMatch[1]);
      const epTitle = itemMatch[2].trim();
      const epUrl = abs(itemMatch[3]);
      episodeList.push({
        number: epNum,
        title: epTitle,
        url: epUrl,
        slug: epUrl.replace(/\/$/, "").split("/").pop() || "",
        date: null,
      });
    }
  }
  episodeList.sort((a, b) => a.number - b.number);

  return {
    slug,
    title,
    title_alt: null,
    poster,
    score,
    status: meta["status"] || "Ongoing",
    genres,
    description,
    episodes: meta["episodes"] ? parseInt(meta["episodes"]) || episodeList.length || null : episodeList.length || null,
    type: meta["type"] || "ONA",
    country: meta["country"] || "China",
    released: meta["released"] || null,
    duration: meta["duration"] || null,
    episode_list: episodeList,
    url: `${BASE}/${slug}/`,
  };
}

export function parseEpisodeServersFromMarkdown(text: string) {
  const lines = text.split("\n");
  const servers: { label: string; stream_url: string }[] = [];

  const knownEmbedPatterns = [
    /^\[(?:Video|Server|Player)\s*(\d*)\s*\]\(([^)]+)\)/i,
    /dailymotion\.com\/(?:video|embed)\/([a-zA-Z0-9]+)/,
    /ok\.ru\/(?:video|embed)\/(\d+)/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    for (const pattern of knownEmbedPatterns) {
      const m = trimmed.match(pattern);
      if (m) {
        let url = "";
        if (pattern === knownEmbedPatterns[0]) {
          url = m[2].trim();
        } else {
          const id = m[1];
          if (trimmed.includes("dailymotion")) url = `https://www.dailymotion.com/embed/video/${id}`;
          else if (trimmed.includes("ok.ru")) url = `https://ok.ru/videoembed/${id}`;
          else if (trimmed.includes("youtube") || trimmed.includes("youtu.be")) url = `https://www.youtube.com/embed/${id}`;
        }
        if (url && !servers.some(s => s.stream_url === url)) {
          servers.push({ label: `Server ${servers.length + 1}`, stream_url: url });
        }
        break;
      }
    }
  }

  let prev_url: string | null = null;
  let next_url: string | null = null;
  for (const line of lines) {
    const t = line.trim();
    const pm = t.match(/^\[Prev\]\(([^)]+)\)/i);
    if (pm) { prev_url = pm[1]; continue; }
    const nm = t.match(/^\[Next\]\(([^)]+)\)/i);
    if (nm) { next_url = nm[1]; }
  }

  return { servers, prev_url, next_url };
}

export function parseDetailAuto(content: string, slug: string) {
  return parseDetailFromMarkdown(content, slug);
}

function parseEpisodeServersAuto(content: string) {
  return parseEpisodeServersFromMarkdown(content);
}

function parseCardsAuto(content: string): any[] {
  return parseCardsFromMarkdown(content);
}

function parseHomepageAuto(content: string) {
  return parseHomepageFromMarkdown(content);
}

function parseSearchAuto(content: string): any[] {
  return parseCardsFromMarkdown(content);
}

export const dmCache = new Map<string, boolean>();

export async function isDailymotionVideoAlive(url: string): Promise<boolean> {
  const m = url.match(/dailymotion\.com\/(?:embed|video)\/([a-zA-Z0-9]+)/);
  if (!m) return true;
  const id = m[1];
  if (dmCache.has(id)) return dmCache.get(id)!;
  try {
    const r = await fetch(`https://api.dailymotion.com/video/${id}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      dmCache.set(id, false);
      return false;
    }
    const j: any = await r.json();
    const alive = !!j?.id && !j?.error;
    dmCache.set(id, alive);
    return alive;
  } catch {
    return true;
  }
}

export async function filterLiveServers(servers: { label: string; stream_url: string }[]): Promise<{ label: string; stream_url: string }[]> {
  const results = await Promise.all(
    servers.map(async (s) => ({ s, alive: await isDailymotionVideoAlive(s.stream_url) }))
  );
  return results.filter((r) => r.alive).map((r) => r.s);
}

export async function searchAnimeXin(query: string): Promise<any[]> {
  const html = await fetchHtml("/", { s: query });
  return parseSearchAuto(html);
}

function looksLikeEpisodePage(detail: any): boolean {
  if (detail.episode_list?.length >= 8) return false;
  if (/\bepisode\s+\d+/i.test(detail.title || "")) {
    if (detail.episode_list?.length > 1 && detail.episodes && detail.episodes <= detail.episode_list.length) return false;
    return true;
  }
  if (detail.episode_list?.length > 0 && detail.episodes && detail.episodes > detail.episode_list.length) return true;
  return false;
}

const resolveCache = new Map<string, { url: string | null; at: number }>();
const RESOLVE_TTL_MS = 60 * 60 * 1000;

export async function resolveAnimeXinSeriesUrl(slug: string): Promise<string | null> {
  const cached = resolveCache.get(slug);
  if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) return cached.url;

  let result: string | null = null;
  const misspelled = slug.replace(/rou/g, "ro");
  const paths = misspelled !== slug
    ? [`/${slug}/`, `/anime/${slug}/`, `/${misspelled}/`, `/anime/${misspelled}/`]
    : [`/${slug}/`, `/anime/${slug}/`];
  for (const path of paths) {
    try {
      const html = await fetchHtml(path);
      const detail = parseDetailAuto(html, slug);
      if (detail.title && detail.episode_list?.length >= 2 && !looksLikeEpisodePage(detail)) {
        result = path;
        break;
      }
    } catch {}
  }
  if (!result) {
    for (const path of paths) {
      try {
        const html = await fetchHtml(path);
        const detail = parseDetailAuto(html, slug);
        if (detail.title && detail.episode_list?.length > 0 && !looksLikeEpisodePage(detail)) {
          result = path;
          break;
        }
      } catch {}
    }
  }
  if (!result) {
    const queries = [slug.replace(/-/g, " ")];
    const misspelled2 = slug.replace(/rou/g, "ro");
    if (misspelled2 !== slug) queries.push(misspelled2.replace(/-/g, " "));
    for (const query of queries) {
      try {
        const items = await searchAnimeXin(query);
        const scored = items
          .filter((i: any) => i.slug && !i.slug.includes("episode"))
          .map((i: any) => {
            let score = 0;
            if (i.title?.toLowerCase().replace(/[^a-z]/g, "") === slug.replace(/[^a-z]/g, "")) score += 5;
            if (i.slug === slug) score += 3;
            const slugWords = slug.split("-");
            const matchWords = slugWords.filter((w) => i.slug?.includes(w) || i.title?.toLowerCase().includes(w));
            score += Math.min(matchWords.length, 2);
            return { ...i, score };
          })
          .sort((a: any, b: any) => b.score - a.score);
        const best = scored[0];
        if (best?.url && best.score >= 3) {
          result = best.url.replace(BASE, "");
          break;
        }
      } catch {}
    }
  }

  resolveCache.set(slug, { url: result, at: Date.now() });
  return result;
}
