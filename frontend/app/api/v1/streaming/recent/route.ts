import { NextResponse } from "next/server";

const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");

  try {
    const query = `query($page:Int){Page(page:$page,perPage:50){
      media(status:RELEASING,type:ANIME,sort:POPULARITY_DESC){
        id title{english romaji}
        coverImage{large}
        nextAiringEpisode{episode airingAt}
        genres
        episodes
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
      .map((m: any) => {
        const title = m.title?.english || m.title?.romaji || "";
        return {
          title,
          episode: m.nextAiringEpisode.episode - 1,
          poster: m.coverImage?.large || null,
          slug: null,
          aired_ago: now - (m.nextAiringEpisode.airingAt - 7 * 24 * 3600),
          genres: m.genres || [],
          anilist_id: m.id,
        };
      })
      .sort((a: any, b: any) => a.aired_ago - b.aired_ago)
      .slice(0, 30);

    return NextResponse.json({ data: results, page, has_next: results.length >= 30 });
  } catch {
    return NextResponse.json({ data: [], page, has_next: false });
  }
}
