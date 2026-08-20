import { NextResponse } from "next/server";
import { fetchHtml, parseCardsFromMarkdown } from "../_animexin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function searchWp(q: string): Promise<any[] | null> {
  try {
    const url = `https://animexin.dev/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=20`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return null;
    return data.map((p: any) => {
      const slug = (p.slug || "").replace(/-episode-\d+.*$/i, "").replace(/-(?:indonesia|english|subtitle|subbed?|dubbed?)(?:-|$).*$/i, "");
      let title = (p.title?.rendered || "").replace(/<[^>]+>/g, "").trim();
      title = title.replace(/\s+Episode\s*\d+.*$/i, "").trim();
      let poster = "";
      const oh: string = p.yoast_head || "";
      const om = oh.match(/property="og:image"\s+content="([^"]+)"/);
      if (om) poster = om[1];
      return { slug, title, poster, episode: null, sub_type: "Sub", type: "ONA", url: p.link || "" };
    }).filter((i: any) => i.slug && i.title);
  } catch { return null; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ error: "Missing query param q" }, { status: 400 });
  try {
    // Try WP search first (reliable, returns structured data)
    const wpItems = await searchWp(q);
    if (wpItems && wpItems.length) {
      return NextResponse.json({ data: wpItems, query: q });
    }
    // Fallback: Jina markdown (may fail with rate limits)
    try {
      const html = await fetchHtml("/", { s: q });
      const items = parseCardsFromMarkdown(html);
      return NextResponse.json({ data: items, query: q });
    } catch {
      // Both sources failed — return empty, not error
      return NextResponse.json({ data: [], query: q });
    }
  } catch (e: any) {
    return NextResponse.json({ data: [], query: q });
  }
}
