import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const REC_QUERY = `query($id:Int){Media(id:$id,type:ANIME){
  recommendations(page:1,perPage:20,sort:RECOMMENDATION_ID_DESC){
    edges{node{mediaRecommendation{id idMal title{english romaji native} coverImage{large} bannerImage}}}
  }
}}`;

function normalizeRec(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  return {
    id: m.idMal || m.id,
    source: m.idMal ? "mal" : "anilist",
    title,
    title_english: m.title?.english || null,
    image: m.coverImage?.large || null,
    banner: m.bannerImage || null,
    score: null,
    popularity: null,
    episodes: null,
    status: null,
    genres: [],
    synopsis: null,
    year: null,
    season: null,
    format: null,
    start_date: null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = parseInt(segments[segments.length - 2]);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Try Jikan first
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/recommendations`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const recs = (data.data || []).map((r: any) => ({
        id: r.entry?.mal_id,
        source: "mal",
        title: r.entry?.title || "",
        title_english: null,
        image: r.entry?.images?.jpg?.image_url || null,
        banner: null,
        score: null,
        popularity: null,
        episodes: null,
        status: null,
        genres: [],
        synopsis: null,
        year: null,
        season: null,
        format: null,
        start_date: null,
      }));
      return NextResponse.json({ data: recs });
    }
  } catch {}

  // Fallback: AniList recommendations
  try {
    const malQuery = `query($ids:[Int]){Page(page:1,perPage:1){media(idMal_in:$ids,type:ANIME){id}}}`;
    const malResp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: malQuery, variables: { ids: [id] } }),
    });
    if (!malResp.ok) return NextResponse.json({ data: [] });
    const malData = await malResp.json();
    const anilistId = malData?.data?.Page?.media?.[0]?.id;
    if (!anilistId) return NextResponse.json({ data: [] });

    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: REC_QUERY, variables: { id: anilistId } }),
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const edges = data?.data?.Media?.recommendations?.edges || [];
    const recs = edges
      .map((e: any) => e.node?.mediaRecommendation)
      .filter(Boolean)
      .map(normalizeRec);
    return NextResponse.json({ data: recs });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
