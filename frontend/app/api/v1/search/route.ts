import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ANILIST_API = "https://graphql.anilist.co";

const SEARCH_QUERY = `query($q:String,$page:Int,$perPage:Int,$genres:[String],$status:MediaStatus,$format:MediaFormat,$sortBy:[MediaSort]){
  Page(page:$page,perPage:$perPage){
    media(search:$q,type:ANIME,sort:$sortBy,genre_in:$genres,status:$status,format_in:$format){
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
    const statusMap: Record<string, string> = { airing: "RELEASING", complete: "FINISHED", upcoming: "NOT_YET_RELEASED" };
    const formatMap: Record<string, string> = { tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL" };
    const sortMap: Record<string, string> = { score: "SCORE_DESC", popularity: "POPULARITY_DESC", title: "TITLE_ENGLISH", start_date: "START_DATE_DESC" };

    const variables: Record<string, any> = { q, page, perPage: 20, sortBy: ["SEARCH_MATCH"] };

    const rawGenres = filters.genres;
    if (rawGenres) variables.genres = rawGenres.split(",").map((g: string) => g.trim());

    const rawStatus = filters.status;
    if (rawStatus && statusMap[rawStatus]) variables.status = statusMap[rawStatus];

    const rawType = filters.type;
    if (rawType && formatMap[rawType]) variables.format = formatMap[rawType];

    const rawOrderBy = filters.order_by;
    if (rawOrderBy && sortMap[rawOrderBy]) variables.sortBy = [sortMap[rawOrderBy]];

    const rawSort = filters.sort;
    if (rawSort === "asc" && variables.sortBy.length) {
      const ascMap: Record<string, string> = { SCORE_DESC: "SCORE", POPULARITY_DESC: "POPULARITY", TITLE_ENGLISH: "TITLE_ENGLISH", START_DATE_DESC: "START_DATE" };
      if (ascMap[variables.sortBy[0]]) variables.sortBy = [ascMap[variables.sortBy[0]]];
    }

    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: SEARCH_QUERY, variables }),
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
