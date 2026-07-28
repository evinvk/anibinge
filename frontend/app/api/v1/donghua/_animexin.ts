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
  $("article.bs").each((_: any, el: any) => {
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

async function fetchViaProxy(url: string): Promise<Response> {
  const proxyUrl = `https://r.jina.ai/http://animexin.dev${new URL(url).pathname}${new URL(url).search}`;
  return fetch(proxyUrl, {
    headers: {
      Authorization: "Bearer jina_abc123",
      "User-Agent": UA,
      Accept: "text/html",
      "X-Return-Format": "text",
    },
  });
}

export async function fetchHtml(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = BASE + path + qs;

  // Try direct fetch first
  const resp = await fetchDirect(url);
  if (resp.ok) return resp.text();

  // Fallback proxies when direct fetch is blocked
  const proxyAttempts = [
    async () => {
      const r = await fetch(`https://r.jina.ai/http://animexin.dev${new URL(url).pathname}${new URL(url).search}`, {
        headers: { "User-Agent": UA, Accept: "text/html", "X-Return-Format": "text" },
      });
      if (!r.ok) throw new Error(`Jina ${r.status}`);
      return r.text();
    },
    async () => {
      const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
        headers: { "User-Agent": UA },
      });
      if (!r.ok) throw new Error(`AllOrigins ${r.status}`);
      return r.text();
    },
  ];

  for (const attempt of proxyAttempts) {
    try {
      const html = await attempt();
      if (html?.length > 100) return html;
    } catch {}
  }

  throw new Error(`AnimeXin ${resp.status}`);
}

export function parseHomepage(html: string) {
  const $ = cheerio.load(html);
  const popular: any[] = [];
  const latest: any[] = [];
  $(".popularslider article.bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) popular.push(item);
  });
  $(".listupd article.bs").each((_: any, el: any) => {
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
  container.find("article.bs").each((_: any, el: any) => {
    const item = parseCard(cheerio.load(el).html() || "");
    if (item.title) items.push(item);
  });
  return items;
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
  // Fallback: direct iframe in content
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
