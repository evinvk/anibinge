import { XMLParser } from "fast-xml-parser";

const ANN_BASE = "https://www.animenewsnetwork.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function extractImage(item: any): string | null {
  if (item["media:content"]?.url) return item["media:content"].url;
  if (item.enclosure?.url && /image/.test(item.enclosure?.type || "")) return item.enclosure.url;
  if (item.description) {
    const m = item.description.match(/<img[^>]+src=["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null;
}

function parseItems(xml: string): any[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const json = parser.parse(xml);
  const channel = json?.rss?.channel;
  if (!channel?.item) return [];
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];
  return items.map((item: any) => ({
    id: item.link || item.title || "",
    title: (item.title || "").trim(),
    url: (item.link || "").trim(),
    summary: stripHtml(item.description || "").slice(0, 300),
    image: extractImage(item),
    category: (item.category || "news").toString().toLowerCase().trim(),
    published_at: (item.pubDate || "").trim(),
  }));
}

export async function fetchRSS(path: string): Promise<string> {
  const resp = await fetch(`${ANN_BASE}${path}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!resp.ok) throw new Error(`ANN ${resp.status}`);
  return resp.text();
}

export async function getNews(page = 1, limit = 20) {
  try {
    const xml = await fetchRSS("/all/rss.xml");
    const allItems = parseItems(xml);
    const total = allItems.length;
    const start = (page - 1) * limit;
    const pageItems = allItems.slice(start, start + limit);
    return { data: pageItems, total, page, limit };
  } catch {
    return { data: [], total: 0, page, limit };
  }
}

export async function getReviews(animeId?: string, page = 1) {
  try {
    const xml = await fetchRSS("/review/rss.xml");
    let allItems = parseItems(xml);
    if (animeId) allItems = allItems.filter((i) => i.url?.includes(animeId));
    const total = allItems.length;
    const start = (page - 1) * 20;
    const pageItems = allItems.slice(start, start + 20);
    return { data: pageItems, total, page };
  } catch {
    return { data: [], total: 0, page };
  }
}

export async function getFeatured() {
  try {
    const xml = await fetchRSS("/all/rss.xml");
    const allItems = parseItems(xml);
    return { data: allItems.slice(0, 5) };
  } catch {
    return { data: [] };
  }
}
