import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ANILIST_API = "https://graphql.anilist.co";

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

const SEARCH_QUERY = `query($q:String,$page:Int,$perPage:Int,$genres:[String],$status:MediaStatus,$format:[MediaFormat],$sort:[MediaSort]){
  Page(page:$page,perPage:$perPage){
    media(search:$q,type:ANIME,isAdult:false,sort:$sort,genre_in:$genres,status:$status,format_in:$format){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres description
      startDate{year month day} season format
    }
  }
}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const rawGenres = url.searchParams.get("genres");
  const rawStatus = url.searchParams.get("status");
  const rawType = url.searchParams.get("type");
  const rawOrderBy = url.searchParams.get("order_by");
  const rawSort = url.searchParams.get("sort");

  if (!q) return NextResponse.json({ data: [] });

  let sortVal = "SEARCH_MATCH";
  const SORT_MAP: Record<string, string> = { score: "SCORE_DESC", popularity: "POPULARITY_DESC", title: "TITLE_ENGLISH", start_date: "START_DATE_DESC" };
  const ASC_MAP: Record<string, string> = { SCORE_DESC: "SCORE", POPULARITY_DESC: "POPULARITY", TITLE_ENGLISH: "TITLE_ENGLISH", START_DATE_DESC: "START_DATE" };
  if (rawOrderBy && SORT_MAP[rawOrderBy]) sortVal = SORT_MAP[rawOrderBy];
  if (rawSort === "asc" && ASC_MAP[sortVal]) sortVal = ASC_MAP[sortVal];

  const STATUS_MAP: Record<string, string> = { airing: "RELEASING", complete: "FINISHED", upcoming: "NOT_YET_RELEASED" };
  const FORMAT_MAP: Record<string, string> = { tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL" };

  const genres = rawGenres ? rawGenres.split(",").map((g) => g.trim()).filter(Boolean) : null;
  const status = rawStatus && STATUS_MAP[rawStatus] ? STATUS_MAP[rawStatus] : null;
  const format = rawType && FORMAT_MAP[rawType] ? [FORMAT_MAP[rawType]] : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { q, page, perPage: 20, genres, status, format, sort: [sortVal] },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ data: [] });
    }
    const data = await resp.json();
    if (data.errors) {
      return NextResponse.json({ data: [] });
    }
    const media = data?.data?.Page?.media || [];
    const results = media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
    return NextResponse.json({ data: results });
  } catch (e) {
    clearTimeout(timeout);
    return NextResponse.json({ data: [] });
  }
}
