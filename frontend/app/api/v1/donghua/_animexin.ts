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

export async function fetchHtml(path: string, params?: Record<string, string>): Promise<string> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = BASE + path + qs;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: "https://animexin.dev/",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  if (!resp.ok) throw new Error(`AnimeXin ${resp.status}`);
  return resp.text();
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
