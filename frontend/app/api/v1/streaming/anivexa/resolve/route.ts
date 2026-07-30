import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const SEARCH_QUERY = `query($q:String){Page(page:1,perPage:10){media(search:$q,type:ANIME){id idMal title{english romaji native} episodes format}}}`;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q) return NextResponse.json({ anilist_id: null, title: null });

  try {
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return NextResponse.json({ anilist_id: null, title: null });

    const data = await resp.json();
    const media = data?.data?.Page?.media;
    if (!media?.length) return NextResponse.json({ anilist_id: null, title: null });

    // Return the best match
    const m = media[0];
    return NextResponse.json({
      anilist_id: m.id,
      mal_id: m.idMal,
      title: m.title?.english || m.title?.romaji || m.title?.native || "",
      episodes: m.episodes,
    });
  } catch {
    return NextResponse.json({ anilist_id: null, title: null });
  }
}
