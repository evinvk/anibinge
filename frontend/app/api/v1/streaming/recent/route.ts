import { NextResponse } from "next/server";
import { fetchGogoApi } from "../gogoanime/_gogoanime";

const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || String(PAGE_SIZE));

  // Fetch recently aired episodes from AniList airing schedule
  const airing = await fetchAiringSchedule(page);
  if (airing.length === 0) {
    return NextResponse.json({ data: [], page, has_next: false });
  }

  // Optionally enrich with GogoAnime slugs (best-effort)
  const enriched = await enrichWithGogoSlugs(airing);

  const start = (page - 1) * limit;
  const pageItems = enriched.slice(start, start + limit);

  return NextResponse.json({
    data: pageItems,
    page,
    has_next: enriched.length > start + limit,
  });
}

async function fetchAiringSchedule(page: number): Promise<any[]> {
  try {
    const query = `
      query($page:Int){
        Page(page:$page,perPage:50){
          airingSchedules(notYetAired:false,sort:TIME_DESC){
            episode
            airingAt
            media{
              id
              title{english romaji}
              coverImage{large}
              genres
            }
          }
        }
      }
    `;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { page } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const schedules = data?.data?.Page?.airingSchedules || [];
    const now = Math.floor(Date.now() / 1000);

    return schedules
      .filter((s: any) => s.media)
      .map((s: any) => {
        const m = s.media;
        const title = m.title?.english || m.title?.romaji || "";
        return {
          title,
          episode: s.episode,
          poster: m.coverImage?.large || null,
          slug: null,
          aired_ago: now - s.airingAt,
          genres: m.genres || [],
          anilist_id: m.id,
        };
      });
  } catch {
    return [];
  }
}

async function enrichWithGogoSlugs(items: any[]): Promise<any[]> {
  try {
    const gogoData = await fetchGogoApi("/api/home");
    const episodes: any[] = gogoData?.latest_episodes || gogoData?.recent_episodes || [];

    // Build a slug map from GogoAnime data (normalized title -> slug)
    const slugMap = new Map<string, string>();
    for (const e of episodes) {
      const id = e.id || e.slug || "";
      const title = (e.title || "").toLowerCase().trim();
      if (id && title) slugMap.set(title, id);
    }

    return items.map((item) => {
      const gogoSlug = slugMap.get(item.title.toLowerCase().trim());
      return { ...item, slug: gogoSlug || null };
    });
  } catch {
    // GogoAnime unreachable — return items without slugs
    return items;
  }
}
