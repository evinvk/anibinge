import * as cheerio from "cheerio";
import { fetchViaCfProxy } from "@/lib/cf-proxy";

export const BASE = "https://animexin.dev";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function abs(url: string): string {
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return url;
}

function parseCard(el: any) {
  const $ = cheerio.load(el);
  const link = $("a").first();
  const href = link.attr("href") || "";
  const title =
    link.find(".eggtitle").text().trim() ||
    link.find(".tt").contents().first().text().trim() ||
    link.find(".tt h2").text().replace(/\s+Episode\s*\d+.*$/i, "").trim() ||
    link.attr("title") ||
    "";
  const poster = abs(link.find("img").attr("src") || "");
  const epText = link.find(".epx").text().trim() || link.find(".eggepisode").text().trim();
  const epMatch = epText.match(/(\d+)/);
  const episode = epMatch ? parseInt(epMatch[1]) : null;
  const subType = link.find(".sb").text().trim() || "Sub";
  const mediaType = link.find(".typez").text().trim() || "ONA";
  const releasedAt = $("time[datetime]").attr("datetime") || null;
  let slug = href.replace(/\/$/, "").split("/").pop() || "";
  slug = slug.replace(/-episode-\d+.*$/, "").replace(/-(?:indonesia|english|subtitle).*$/i, "");
  return { slug, title, poster, episode, sub_type: subType, type: mediaType, url: href, released_at: releasedAt };
}

export function parseCards(html: string): any[] {
  const $ = cheerio.load(html);
  const items: any[] = [];
  $(".bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) items.push(item);
  });
  return items;
}

async function fetchDirect(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Referer: "https://animexin.dev/",
    },
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 3600 },
  });
}

// Extract donghua items from markdown link lines (Jina AI output)
// Expected format:
//   [TYPE Ep N SUBTITLE ![ALT](IMG_URL) TITLE ## ...](PAGE_URL "...")
// or:
//   [Sub TITLE TYPE Episode N ![ALT](IMG_URL) ## ...](PAGE_URL "...")
function parseMarkdownLine(line: string): any | null {
  // Match markdown link: [text](url "title")
  const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!linkMatch) return null;
  const fullText = linkMatch[1];
  const url = linkMatch[2].replace(/".*$/, "").trim();
  if (!url || url === "#" || url.startsWith("http://animexin.dev/#")) return null;

  // Extract image URL from markdown image syntax
  const imgMatch = fullText.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const poster = imgMatch ? imgMatch[1] : "";

  // Extract episode number
  const epMatch = fullText.match(/Ep(?:isode)?\s*(\d+)/i);
  const episode = epMatch ? parseInt(epMatch[1]) : null;

  // Extract subtitle type
  const subMatch = fullText.match(/^(Sub|Dub)\b/i);
  const subType = subMatch ? subMatch[1] : "Sub";

  // Extract media type (ONA, Movie, etc.)
  const typeMatch = fullText.match(/\b(ONA|Movie|OVA|Special|TV)\b/i);
  const mediaType = typeMatch ? typeMatch[1] : "ONA";

  // Extract title - text between image and ##, or after ##
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

  // Some titles have " ## " in them
  if (!title) {
    const textParts = fullText.split("##");
    if (textParts.length > 1) {
      title = textParts[textParts.length - 1].trim();
    }
  }

  // Clean up the title
  title = title.replace(/^\d+\s+/, "").replace(/\s*\[.*$/, "").trim();
  if (!title) {
    // Try getting title from URL
    const urlParts = url.replace(/\/$/, "").split("/");
    title = decodeURIComponent(urlParts[urlParts.length - 1] || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  // Extract slug from URL
  let slug = url.replace(/\/$/, "").split("/").pop() || "";
  slug = slug.replace(/-episode-\d+.*$/, "").replace(/-(?:indonesia|english|subtitle).*$/i, "");

  return { slug, title, poster, episode, sub_type: subType, type: mediaType, url: abs(url) };
}

// Parse markdown homepage output from Jina AI
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

// Parse markdown list/cards output from Jina AI (for paginated pages)
export function parseCardsFromMarkdown(text: string): any[] {
  const items: any[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    // Skip navigation links
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
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Jina AI ${resp.status}`);
  const text = await resp.text();
  // Jina AI wraps the content in markdown, extract from Markdown Content: section
  const mdMatch = text.match(/Markdown Content:\s*\n([\s\S]*)/);
  return mdMatch ? mdMatch[1].trim() : text;
}

const htmlCache = new Map<string, { html: string; at: number }>();
const HTML_TTL_MS = 60 * 60 * 1000;

export async function fetchHtml(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = BASE + path + qs;
  const key = path + qs;

  const cached = htmlCache.get(key);
  if (cached && Date.now() - cached.at < HTML_TTL_MS) return cached.html;

  const errors: string[] = [];

  // Try direct fetch first
  const resp = await fetchDirect(url);
  if (resp.ok) {
    const text = await resp.text();
    htmlCache.set(key, { html: text, at: Date.now() });
    return text;
  }
  errors.push(`Direct ${resp.status}`);

  // Fallback: Cloudflare Worker proxy (not blocked by animexin.dev's Cloudflare)
  try {
    const html = await fetchViaCfProxy(url);
    if (html?.length > 100) {
      htmlCache.set(key, { html, at: Date.now() });
      return html;
    }
  } catch (e: any) {
    errors.push(e.message || "CF Proxy failed");
  }

  // Fallback: try Jina AI (returns markdown)
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
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
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

  throw new Error(`AnimeXin fetch failed: ${errors.join(", ")}`);
}

export function parseHomepage(html: string) {
  const $ = cheerio.load(html);
  const popular: any[] = [];
  const latest: any[] = [];
  $(".popularslider .bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) popular.push(item);
  });
  $(".listupd .bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) latest.push(item);
  });
  return { popular, latest };
}

export function parseDetail(html: string, slug: string) {
  const $ = cheerio.load(html);
  const title =
    $(".infox h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    slug;
  const poster = abs($(".thumb img").attr("src") || $(".bigcontent img").attr("src") || "");
  const scoreText = $(".rating strong").text().trim();
  const scoreMatch = scoreText.match(/([\d.]+)/);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
  const meta: Record<string, string> = {};
  $(".spe span").each((_: any, el: any) => {
    const text = $(el).text().trim();
    if (text.includes(":")) {
      const [k, ...v] = text.split(":");
      meta[k.trim().toLowerCase()] = v.join(":").trim();
    }
  });
  const genres: string[] = [];
  $(".genxed a").each((_: any, el: any) => {
    genres.push($(el).text().trim());
  });
  $(".desc .colap, .desc b").remove();
  let description = $(".desc").text().trim();
  const watchMatch = description.match(/^Watch streaming\s+.*?on AnimeXin\.\s*(.*)/i);
  if (watchMatch) description = watchMatch[1].trim();
  if (!description) description = $(".infox .ninfo").text().trim();
  const epText = meta["episodes"] || "";
  const epMatchNum = epText.match(/(\d+)/);
  const episodes = epMatchNum ? parseInt(epMatchNum[1]) : null;
  const episodeList: any[] = [];
  $(".eplister a[href], #episodeLists a[href]").each((_: any, el: any) => {
    const epHref = $(el).attr("href") || "";
    const epNumText = $(el).find(".epl-num").text().trim();
    let epNum: number | null = null;
    const epNumMatch = epNumText.match(/(\d+)/);
    if (epNumMatch) epNum = parseInt(epNumMatch[1]);
    if (!epNum) {
      const urlMatch = epHref.match(/episode-(\d+)/i);
      if (urlMatch) epNum = parseInt(urlMatch[1]);
    }
    if (epNum) {
      const epTitle = $(el).find(".epl-title").text().trim() || `Episode ${epNum}`;
      const epDate = $(el).find(".epl-date").text().trim() || null;
      episodeList.push({
        number: epNum,
        title: epTitle,
        url: epHref,
        slug: epHref.replace(/\/$/, "").split("/").pop() || "",
        date: epDate,
      });
    }
  });
  episodeList.sort((a: any, b: any) => a.number - b.number);
  const status = meta["status"] || "Ongoing";
  return {
    slug,
    title,
    title_alt: null,
    poster,
    score,
    status,
    genres,
    description,
    episodes: episodes || episodeList.length || null,
    type: meta["type"] || "ONA",
    country: meta["country"] || "China",
    released: meta["released"] || null,
    duration: meta["duration"] || null,
    episode_list: episodeList,
    url: `${BASE}/${slug}/`,
  };
}

export function parseSearch(html: string): any[] {
  const $ = cheerio.load(html);
  const items: any[] = [];
  const container = $(".listupd").length ? $(".listupd") : $("body");
  container.find(".bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) items.push(item);
  });
  return items;
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

// Fetch latest release posts from the WordPress REST API (has exact publish dates)
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

// Auto-detect content format and parse accordingly
export function parseCardsAuto(content: string): any[] {
  if (content.includes("<") && (content.includes("<div") || content.includes("<article") || content.includes("<html") || content.includes("class="))) {
    return parseCards(content);
  }
  return parseCardsFromMarkdown(content);
}

export function parseHomepageAuto(content: string) {
  if (content.includes("<") && (content.includes("<div") || content.includes("<article") || content.includes("<html") || content.includes("class="))) {
    return parseHomepage(content);
  }
  return parseHomepageFromMarkdown(content);
}

export function parseSearchAuto(content: string): any[] {
  if (content.includes("<") && (content.includes("<div") || content.includes("<article") || content.includes("<html") || content.includes("class="))) {
    return parseSearch(content);
  }
  return parseCardsFromMarkdown(content);
}

// Parse donghua detail from Jina AI markdown output
export function parseDetailFromMarkdown(text: string, slug: string) {
  const lines = text.split("\n");

  // Title — first h1 after markdown content
  let title = slug;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) { title = m[1].trim(); break; }
  }

  // Poster — first image URL
  let poster = "";
  for (const line of lines) {
    const m = line.match(/!\[.*?\]\(([^)]+)\)/);
    if (m) { poster = abs(m[1]); break; }
  }

  // Rating
  let score: number | null = null;
  for (const line of lines) {
    const m = line.match(/\*\*Rating\s*([\d.]+)\*\*/);
    if (m) { score = parseFloat(m[1]); break; }
  }

  // Metadata line (Status, Type, Episodes, Released, Duration, Country)
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

  // Genres — line with genre links
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

  // Description — after "Synopsis" header
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

  // Episode list
  const episodeList: any[] = [];
  let inEpisodes = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###?\s+Watch/i.test(trimmed)) { inEpisodes = true; continue; }
    if (inEpisodes && /^###?\s/.test(trimmed)) break;
    if (!inEpisodes) continue;
    // Match: * [N Title ...](url)
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

// Parse donghua episode servers from Jina AI markdown output
export function parseEpisodeServersFromMarkdown(text: string) {
  const lines = text.split("\n");
  const servers: { label: string; stream_url: string }[] = [];

  // Match [Video N](url), [Server N](url), [Player N](url), or plain embed URLs (dailymotion, etc.)
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
          // Construct embed URL from the matched ID
          const id = m[1];
          if (trimmed.includes("dailymotion")) url = `https://www.dailymotion.com/embed/video/${id}`;
          else if (trimmed.includes("ok.ru")) url = `https://ok.ru/videoembed/${id}`;
          else if (trimmed.includes("youtube") || trimmed.includes("youtu.be")) url = `https://www.youtube.com/embed/${id}`;
        }
        if (url && !servers.some(s => s.stream_url === url)) {
          servers.push({ label: `Server ${servers.length + 1}`, stream_url: url });
        }
        break; // matched this line, move to next
      }
    }
  }

  // Prev/Next
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

// Auto-detect content format for detail
export function parseDetailAuto(content: string, slug: string) {
  if (content.includes("<") && (content.includes("<div") || content.includes("<article") || content.includes("<html") || content.includes("class="))) {
    return parseDetail(content, slug);
  }
  return parseDetailFromMarkdown(content, slug);
}

// Auto-detect content format for episode servers
export function parseEpisodeServersAuto(content: string) {
  if (content.includes("<") && (content.includes("<div") || content.includes("<iframe") || content.includes("<html") || content.includes("class=") || content.includes("option"))) {
    return parseEpisodeServers(content);
  }
  return parseEpisodeServersFromMarkdown(content);
}

export function parseEpisodeServers(html: string): {
  servers: { label: string; stream_url: string }[];
  prev_url: string | null;
  next_url: string | null;
} {
  const $ = cheerio.load(html);
  const servers: { label: string; stream_url: string }[] = [];
  $("div.option, .server, .playex, .embed-responsive iframe").each((_: any, el: any) => {
    const iframe = $(el).is("iframe") ? $(el) : $(el).find("iframe");
    const src = iframe.attr("src") || iframe.attr("data-src") || "";
    if (src) {
      const label = $(el).find(".label, .server-title, span").first().text().trim() || "Server " + (servers.length + 1);
      servers.push({ label, stream_url: src });
    }
  });
  if (servers.length === 0) {
    $("iframe").each((_: any, el: any) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src && !src.includes("google") && !src.includes("facebook")) {
        servers.push({ label: "Server " + (servers.length + 1), stream_url: src });
      }
    });
  }
  const prevLink = $("a.prev, .prev_link, .navigation a:contains('Prev')").attr("href") || null;
  const nextLink = $("a.next, .next_link, .navigation a:contains('Next')").attr("href") || null;
  return { servers, prev_url: prevLink, next_url: nextLink };
}

// Search AnimeXin and return parsed items
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
  const paths = [`/${slug}/`, `/anime/${slug}/`];
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
    const misspelled = slug.replace(/rou/g, "ro");
    if (misspelled !== slug) queries.push(misspelled.replace(/-/g, " "));
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
