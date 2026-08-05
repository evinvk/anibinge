import { NextResponse } from "next/server";
import { enrichWithViews } from "@/lib/views";
import { searchManga as searchMangaMD } from "../manhwa/_mangadex";
import { searchManga as searchMangaCK } from "../manhwa/_comick";

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const rawGenres = url.searchParams.get("genres");
  const rawStatus = url.searchParams.get("status");
  const rawType = url.searchParams.get("type");
  const rawOrderBy = url.searchParams.get("order_by");
  const rawSort = url.searchParams.get("sort");
  const rawYear = url.searchParams.get("year");
  const rawSeason = url.searchParams.get("season");

  // "anime" is the browse page's sentinel default query — treat it as "no search term"
  // so filters (type/year/season) return full catalogs instead of empty results.
  const useSearch = q.length > 0 && q.toLowerCase() !== "anime";

  let sortVal = "SEARCH_MATCH";
  const SORT_MAP: Record<string, string> = { score: "SCORE_DESC", popularity: "POPULARITY_DESC", title: "TITLE_ENGLISH", start_date: "START_DATE_DESC" };
  const ASC_MAP: Record<string, string> = { SCORE_DESC: "SCORE", POPULARITY_DESC: "POPULARITY", TITLE_ENGLISH: "TITLE_ENGLISH", START_DATE_DESC: "START_DATE" };
  if (rawOrderBy && SORT_MAP[rawOrderBy]) sortVal = SORT_MAP[rawOrderBy];
  if (rawSort === "asc" && ASC_MAP[sortVal]) sortVal = ASC_MAP[sortVal];
  if (!useSearch && sortVal === "SEARCH_MATCH") sortVal = "POPULARITY_DESC";

  const STATUS_MAP: Record<string, string> = { airing: "RELEASING", complete: "FINISHED", upcoming: "NOT_YET_RELEASED" };
  const FORMAT_MAP: Record<string, string> = { tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL" };

  const genres = rawGenres ? rawGenres.split(",").map((g) => g.trim()).filter(Boolean) : null;
  const status = rawStatus && STATUS_MAP[rawStatus] ? STATUS_MAP[rawStatus] : null;
  const format = rawType && FORMAT_MAP[rawType] ? [FORMAT_MAP[rawType]] : null;
  const year = rawYear && /^\d{4}$/.test(rawYear) ? parseInt(rawYear) : null;
  const season = rawSeason && ["WINTER", "SPRING", "SUMMER", "FALL"].includes(rawSeason.toUpperCase()) ? rawSeason.toUpperCase() : null;

  const varDecls = ["$page:Int", "$perPage:Int", "$sort:[MediaSort]"];
  const mediaArgs = ["type:ANIME", "countryOfOrigin:JP", "isAdult:false", "sort:$sort"];
  if (useSearch) { varDecls.push("$q:String"); mediaArgs.unshift("search:$q"); }
  if (genres?.length) { varDecls.push("$genres:[String]"); mediaArgs.push("genre_in:$genres"); }
  if (status) { varDecls.push("$status:MediaStatus"); mediaArgs.push("status:$status"); }
  if (format?.length) { varDecls.push("$format:[MediaFormat]"); mediaArgs.push("format_in:$format"); }
  if (year) { varDecls.push("$seasonYear:Int"); mediaArgs.push("seasonYear:$seasonYear"); }
  if (season) { varDecls.push("$season:MediaSeason"); mediaArgs.push("season:$season"); }

  const SEARCH_QUERY = `query(${varDecls.join(",")}){
  Page(page:$page,perPage:$perPage){
    media(${mediaArgs.join(",")}){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres description
      startDate{year month day} season format
    }
  }
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const variables: Record<string, any> = { page, perPage: 20, sort: [sortVal] };
    if (useSearch) variables.q = q;
    if (genres?.length) variables.genres = genres;
    if (status) variables.status = status;
    if (format?.length) variables.format = format;
    if (year) variables.seasonYear = year;
    if (season) variables.season = season;

    // AniList rate-limits Vercel's shared egress IPs — retry with backoff and cache
    // upstream hits (cache key includes the query body, so every search is cached separately).
    let results: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(ANILIST_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": UA },
          body: JSON.stringify({ query: SEARCH_QUERY, variables }),
          signal: controller.signal,
          next: { revalidate: 3600 },
        });
      } catch (e) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break;
      }
      if (!resp.ok) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break;
      }
      const data = await resp.json();
      if (data.errors) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break;
      }
      results = data?.data?.Page?.media || [];
      break;
    }
    clearTimeout(timeout);

    if (results.length > 0) {
      const mapped = results.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
      return NextResponse.json({ data: enrichWithViews(mapped) });
    }

    // No Japanese-anime match (or upstream rate-limited) — fall back to manhwa so
    // titles like "Tomb Raider King" still surface in search.
    if (useSearch) {
      const manhwa = await searchMangaMD(q)
        .then((r) => (r.data.length > 0 ? r : searchMangaCK(q)))
        .catch(() => searchMangaCK(q))
        .then((r) => r.data.map((item: any) => ({
          id: item.id,
          source: "manhwa",
          title: item.title,
          title_english: item.title,
          image: item.poster,
          banner: null,
          score: item.rating,
          popularity: null,
          episodes: null,
          status: item.status,
          genres: item.genres,
          synopsis: item.description,
          year: null,
          season: null,
          format: "Manhwa",
          start_date: null,
        })))
        .catch(() => []);
      if (manhwa.length > 0) return NextResponse.json({ data: manhwa });
    }

    return NextResponse.json({ data: [] });
  } catch (e) {
    clearTimeout(timeout);
    return NextResponse.json({ data: [] });
  }
}
