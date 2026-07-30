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

const STATUS_MAP: Record<string, string> = { airing: "RELEASING", complete: "FINISHED", upcoming: "NOT_YET_RELEASED" };
const FORMAT_MAP: Record<string, string> = { tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL" };
const SORT_MAP: Record<string, string> = { score: "SCORE_DESC", popularity: "POPULARITY_DESC", title: "TITLE_ENGLISH", start_date: "START_DATE_DESC" };
const ASC_MAP: Record<string, string> = { SCORE_DESC: "SCORE", POPULARITY_DESC: "POPULARITY", TITLE_ENGLISH: "TITLE_ENGLISH", START_DATE_DESC: "START_DATE" };

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

  // Build AniList query with only the filters that are active
  const filters: string[] = ["search:$q", "type:ANIME"];
  const vars: Record<string, any> = { q, page, perPage: 20 };

  let sortVal = "SEARCH_MATCH";
  if (rawOrderBy && SORT_MAP[rawOrderBy]) sortVal = SORT_MAP[rawOrderBy];
  if (rawSort === "asc" && ASC_MAP[sortVal]) sortVal = ASC_MAP[sortVal];
  filters.push(`sort:[${sortVal}]`);

  if (rawGenres) {
    const genres = rawGenres.split(",").map((g) => g.trim()).filter(Boolean);
    if (genres.length) {
      filters.push("genre_in:$genres");
      vars.genres = genres;
    }
  }

  if (rawStatus && STATUS_MAP[rawStatus]) {
    filters.push("status:$status");
    vars.status = STATUS_MAP[rawStatus];
  }

  if (rawType && FORMAT_MAP[rawType]) {
    filters.push("format_in:$format");
    vars.format = FORMAT_MAP[rawType];
  }

  const query = `query($q:String,$page:Int,$perPage:Int${vars.genres ? ",$genres:[String]" : ""}${vars.status ? ",$status:MediaStatus" : ""}${vars.format ? ",$format:MediaFormat" : ""}){
    Page(page:$page,perPage:$perPage){
      media(${filters.join(",")}){
        id idMal title{english romaji native}
        coverImage{large} bannerImage
        averageScore popularity episodes status genres description
        startDate{year month day} season format
      }
    }
  }`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: vars }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    const results = media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
    return NextResponse.json({ data: results });
  } catch (e) {
    clearTimeout(timeout);
    console.error("search route error:", e);
    return NextResponse.json({ data: [] });
  }
}
