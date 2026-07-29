import * as cheerio from "cheerio";

const BASE = "https://animexin.dev";
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
    link.find(".tt").contents().first().text().trim() ||
    link.find(".tt h2").text().trim() ||
    link.attr("title") ||
    "";
  const poster = abs(link.find("img").attr("src") || "");
  const epText = link.find(".epx").text().trim();
  const epMatch = epText.match(/(\d+)/);
  const episode = epMatch ? parseInt(epMatch[1]) : null;
  const subType = link.find(".sb").text().trim() || "Sub";
  const mediaType = link.find(".typez").text().trim() || "ONA";
  let slug = href.replace(/\/$/, "").split("/").pop() || "";
  slug = slug.replace(/-episode-\d+.*$/, "").replace(/-(?:indonesia|english|subtitle).*$/i, "");
  return { slug, title, poster, episode, sub_type: subType, type: mediaType, url: href };
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
  });
}

const CF_PROXY = process.env.CF_PROXY_URL || "";

async function fetchViaCfProxy(url: string): Promise<string> {
  if (!CF_PROXY) throw new Error("CF_PROXY_URL not configured");
  const proxyUrl = `${CF_PROXY}?url=${encodeURIComponent(url)}`;
  const resp = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`CF Proxy ${resp.status}`);
  return resp.text();
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
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`Jina AI ${resp.status}`);
  const text = await resp.text();
  // Jina AI wraps the content in markdown, extract from Markdown Content: section
  const mdMatch = text.match(/Markdown Content:\s*\n([\s\S]*)/);
  return mdMatch ? mdMatch[1].trim() : text;
}

export async function fetchHtml(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = BASE + path + qs;

  const errors: string[] = [];

  // Try direct fetch first
  const resp = await fetchDirect(url);
  if (resp.ok) return resp.text();
  errors.push(`Direct ${resp.status}`);

  // Fallback: Cloudflare Worker proxy (not blocked by animexin.dev's Cloudflare)
  try {
    const html = await fetchViaCfProxy(url);
    if (html?.length > 100) return html;
  } catch (e: any) {
    errors.push(e.message || "CF Proxy failed");
  }

  // Fallback: try Jina AI (returns markdown)
  try {
    const md = await fetchViaJina(path, params);
    if (md?.length > 50) return md;
  } catch (e: any) {
    errors.push(e.message || "Jina AI failed");
  }

  // Fallback: AllOrigins proxy
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const text = await r.text();
      if (text?.length > 100) return text;
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

  // Find video links like [Video N](url) or [Server N](url)
  let serverIdx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const videoMatch = trimmed.match(/^\[(?:Video|Server|Player)\s*(\d*)\s*\]\(([^)]+)\)/i);
    if (videoMatch) {
      const url = videoMatch[2].trim();
      if (url && url.startsWith("http") && !url.includes("facebook") && !url.includes("google")) {
        serverIdx++;
        servers.push({
          label: `Server ${videoMatch[1] || serverIdx}`,
          stream_url: url,
        });
      }
    }
  }

  // Also check for direct embed URLs
  if (servers.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      const m = trimmed.match(/\]\(((?:https?:)?\/\/[^)]+)\)/);
      if (m) {
        const url = m[1];
        if (url.startsWith("http") && !url.includes("facebook") && !url.includes("google") && !url.includes("animexin")) {
          servers.push({ label: `Server ${servers.length + 1}`, stream_url: url });
        }
      }
    }
  }

  // Prev/Next links
  let prev_url: string | null = null;
  let next_url: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const prevMatch = trimmed.match(/^\[Prev\]\(([^)]+)\)/i);
    if (prevMatch) { prev_url = prevMatch[1]; continue; }
    const nextMatch = trimmed.match(/^\[Next\]\(([^)]+)\)/i);
    if (nextMatch) { next_url = nextMatch[1]; }
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
