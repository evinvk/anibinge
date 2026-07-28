import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ANILIST_API = "https://graphql.anilist.co";

const SEARCH_QUERY = `query($q:String,$page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(search:$q,type:ANIME,sort:SEARCH_MATCH){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres description
      startDate{year month day} season format
    }
  }
}`;

function normalizeMedia(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  return {
    id: m.idMal || m.id,
    source: m.idMal ? "mal" : "anilist",
    title,
    title_english: m.title?.english || null,
    image: m.coverImage?.large || null,
    banner: m.bannerImage || null,
    score: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity || null,
    episodes: m.episodes || null,
    status: m.status || null,
    genres: m.genres || [],
    synopsis: m.description?.replace(/<[^>]*>/g, "")?.slice(0, 500) || null,
    year: m.startDate?.year || null,
    season: m.season || null,
    format: m.format || null,
    start_date: m.startDate
      ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}`
      : null,
  };
}

function buildJikanUrl(q: string, filters: Record<string, string>) {
  let endpoint = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&sfw&limit=20`;
  if (filters.genres) endpoint += `&genres=${filters.genres}`;
  if (filters.status === "airing") endpoint += "&status=airing";
  else if (filters.status === "complete") endpoint += "&status=complete";
  else if (filters.status === "upcoming") endpoint += "&status=upcoming";
  if (filters.type) endpoint += `&type=${filters.type}`;
  if (filters.order_by) endpoint += `&order_by=${filters.order_by}`;
  if (filters.sort) endpoint += `&sort=${filters.sort}`;
  return endpoint;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const filters: Record<string, string> = {};
  for (const key of ["genres", "status", "type", "order_by", "sort"]) {
    const val = url.searchParams.get(key);
    if (val) filters[key] = val;
  }
  if (!q) return NextResponse.json({ data: [] });

  // Try Jikan first, fall back to AniList
  try {
    const jikanUrl = buildJikanUrl(q, filters);
    const resp = await fetch(jikanUrl, { headers: { "User-Agent": UA } });
    if (resp.ok) {
      const data = await resp.json();
      const results = (data.data || []).map((d: any) => ({
        id: d.mal_id,
        source: "mal",
        title: d.title || "",
        title_english: d.title_english || null,
        image: d.images?.jpg?.image_url || null,
        banner: d.trailer?.images?.maximum_image_url || null,
        score: d.score || null,
        popularity: d.popularity || null,
        episodes: d.episodes || null,
        status: d.status || null,
        genres: (d.genres || []).map((g: any) => g.name),
        synopsis: d.synopsis?.slice(0, 500) || null,
        year: d.year || null,
        season: d.season || null,
        format: d.type || null,
        start_date: d.aired?.from?.split("T")[0] || null,
      }));
      return NextResponse.json({ data: results });
    }
  } catch { /* fall through */ }

  // Fallback: AniList
  try {
    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q, page, perPage: 20 } }),
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    const results = media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
    return NextResponse.json({ data: results });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
