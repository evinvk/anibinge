import { NextResponse } from "next/server";
import { fetchGogoApi } from "../gogoanime/_gogoanime";

const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || String(PAGE_SIZE));

  // Primary: fetch real uploads from GogoAnime
  try {
    const gogoData = await fetchGogoApi("/api/home");
    let episodes: any[] = gogoData?.latest_episodes || gogoData?.recent_episodes || [];

    if (episodes.length === 0) throw new Error("No episodes from GogoAnime");

    const items = episodes
      .map((e: any) => ({
        slug: e.id || e.slug || "",
        title: e.title || "",
        poster: e.image || e.poster || null,
        episode: parseInt(e.episode) || e.latest_episode || 0,
      }))
      .filter((e: any) => e.slug && e.episode > 0);

    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    // Enrich with AniList metadata in parallel (best effort)
    const enriched = await enrichBatch(pageItems);

    return NextResponse.json({
      data: enriched,
      page,
      has_next: items.length > start + limit,
    });
  } catch {
    // Fallback: AniList schedule data
    return fallbackToAnilist(page, limit);
  }
}

async function enrichBatch(items: any[]): Promise<any[]> {
  // Single AniList query for all items — search by title via fuzzy match
  try {
    const titles = items.map((i) => i.title);
    const query = `
      query {
        ${titles.map((t, idx) => `a${idx}: Media(search: "${t.replace(/"/g, '\\"')}", type: ANIME) {
          id title { english romaji } coverImage { large } genres
        }`).join("\n")}
      }
    `;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const now = Math.floor(Date.now() / 1000);
      return items.map((item, idx) => {
        const meta = data?.data?.[`a${idx}`];
        return {
          title: item.title,
          episode: item.episode,
          poster: meta?.coverImage?.large || item.poster,
          slug: item.slug,
          aired_ago: 0,
          genres: meta?.genres || [],
          anilist_id: meta?.id || null,
        };
      });
    }
  } catch {}

  // Fallback: return with GogoAnime data as-is
  return items.map((item) => ({
    title: item.title,
    episode: item.episode,
    poster: item.poster,
    slug: item.slug,
    aired_ago: 0,
    genres: [],
    anilist_id: null,
  }));
}

async function fallbackToAnilist(page: number, limit: number) {
  try {
    const query = `query($page:Int){Page(page:$page,perPage:50){
      media(status:RELEASING,type:ANIME,sort:POPULARITY_DESC){
        id title{english romaji}
        coverImage{large}
        nextAiringEpisode{episode airingAt}
        genres
      }
    }}`;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { page } }),
    });
    if (!resp.ok) return NextResponse.json({ data: [], page, has_next: false });
    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    const now = Math.floor(Date.now() / 1000);
    const results = media
      .filter((m: any) => m.nextAiringEpisode)
      .map((m: any) => ({
        title: m.title?.english || m.title?.romaji || "",
        episode: m.nextAiringEpisode.episode - 1,
        poster: m.coverImage?.large || null,
        slug: null,
        aired_ago: now - (m.nextAiringEpisode.airingAt - 7 * 24 * 3600),
        genres: m.genres || [],
        anilist_id: m.id,
      }))
      .sort((a: any, b: any) => a.aired_ago - b.aired_ago)
      .slice(0, limit);

    return NextResponse.json({ data: results, page, has_next: results.length >= limit });
  } catch {
    return NextResponse.json({ data: [], page, has_next: false });
  }
}
