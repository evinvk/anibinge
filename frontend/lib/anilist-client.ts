import { type AnimeSummary } from "./api";

const ANILIST_GQL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id idMal title{english romaji native}
  coverImage{large} bannerImage
  averageScore popularity episodes status genres description
  startDate{year month day} season format
`;

export const TRENDING_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(sort:TRENDING_DESC,type:ANIME,countryOfOrigin:JP,isAdult:false){
      ${MEDIA_FIELDS}
    }
  }
}`;

export const TOP_RATED_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(sort:SCORE_DESC,type:ANIME,countryOfOrigin:JP,isAdult:false){
      ${MEDIA_FIELDS}
    }
  }
}`;

export const AIRING_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(status:RELEASING,sort:POPULARITY_DESC,type:ANIME,countryOfOrigin:JP,isAdult:false){
      ${MEDIA_FIELDS}
      nextAiringEpisode{airingAt timeUntilAiring episode}
    }
  }
}`;

export function normalizeAnilistMedia(m: any): AnimeSummary {
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

export async function fetchAnilistGql(
  query: string,
  variables: Record<string, any>,
): Promise<AnimeSummary[]> {
  const resp = await fetch(ANILIST_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const media = data?.data?.Page?.media || [];
  return media
    .filter((m: any) => m.title?.english || m.title?.romaji)
    .map(normalizeAnilistMedia);
}

export async function fetchTrending(page = 1, perPage = 30): Promise<AnimeSummary[]> {
  return fetchAnilistGql(TRENDING_QUERY, { page, perPage });
}

export async function fetchTopRated(page = 1, perPage = 30): Promise<AnimeSummary[]> {
  return fetchAnilistGql(TOP_RATED_QUERY, { page, perPage });
}

export async function fetchAiring(page = 1, perPage = 30): Promise<AnimeSummary[]> {
  return fetchAnilistGql(AIRING_QUERY, { page, perPage });
}

const SEASONAL_QUERY = `query($season:MediaSeason,$year:Int,$page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(season:$season,seasonYear:$year,type:ANIME,countryOfOrigin:JP,isAdult:false,sort:POPULARITY_DESC){
      ${MEDIA_FIELDS}
    }
  }
}`;

export async function fetchSeasonal(year: number, season: string, page = 1, perPage = 30): Promise<AnimeSummary[]> {
  return fetchAnilistGql(SEASONAL_QUERY, { season: season.toUpperCase(), year, page, perPage });
}

const SEARCH_SORT_MAP: Record<string, string> = {
  score: "SCORE_DESC",
  popularity: "POPULARITY_DESC",
  title: "TITLE_ENGLISH",
  start_date: "START_DATE_DESC",
};
const SEARCH_ASC_MAP: Record<string, string> = {
  SCORE_DESC: "SCORE",
  POPULARITY_DESC: "POPULARITY",
  TITLE_ENGLISH: "TITLE_ENGLISH",
  START_DATE_DESC: "START_DATE",
};
const SEARCH_STATUS_MAP: Record<string, string> = {
  airing: "RELEASING",
  complete: "FINISHED",
  upcoming: "NOT_YET_RELEASED",
};
const SEARCH_FORMAT_MAP: Record<string, string> = {
  tv: "TV",
  movie: "MOVIE",
  ova: "OVA",
  ona: "ONA",
  special: "SPECIAL",
};

export interface SearchAnimeParams {
  query: string;
  page?: number;
  perPage?: number;
  genres?: string;
  status?: string;
  type?: string;
  orderBy?: string;
  sort?: string;
  year?: string;
  season?: string;
}

const DETAIL_QUERY = `query($id:Int){Media(id:$id,type:ANIME){
  id idMal title{english romaji native}
  coverImage{large extraLarge} bannerImage
  averageScore popularity favourites
  genres status episodes description
  nextAiringEpisode{episode}
  startDate{year month day} season format
  trailer{id site}
  studios{edges{isMain node{name}}}
  relations{edges{relationType node{id idMal title{english romaji native} coverImage{large} episodes format}}}
}}`;

export interface AnilistDetail {
  mal_id: number | null;
  anilist_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  images: { jpg: { large_image_url: string | null } };
  trailer: { images: { maximum_image_url: string | null } } | null;
  score: number | null;
  popularity: number | null;
  members: number | null;
  genres: { mal_id: null; name: string }[];
  synopsis: string | null;
  studios: { name: string }[];
  relations: { id: number; mal_id: number | null; type: string; title: string; image: string | null; episodes: number | null; format: string | null }[];
  status: string | null;
  episodes: number | null;
  rating: null;
  year: number | null;
  season: string | null;
  format: string | null;
  start_date: string | null;
}

export async function fetchAnimeDetailClient(id: number): Promise<AnilistDetail | null> {
  try {
    const resp = await fetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: DETAIL_QUERY, variables: { id } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const m = data?.data?.Media;
    if (!m) return null;
    const title = m.title?.english || m.title?.romaji || m.title?.native || "";
    return {
      mal_id: m.idMal,
      anilist_id: m.id,
      title,
      title_english: m.title?.english || null,
      title_japanese: m.title?.native || null,
      images: { jpg: { large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || null } },
      trailer: m.bannerImage ? { images: { maximum_image_url: m.bannerImage } } : null,
      score: m.averageScore ? m.averageScore / 10 : null,
      popularity: m.popularity || null,
      members: m.favourites || null,
      genres: (m.genres || []).map((g: string) => ({ mal_id: null, name: g })),
      synopsis: m.description?.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "") || null,
      studios: (m.studios?.edges || []).filter((e: any) => e.isMain).map((e: any) => ({ name: e.node.name })),
      relations: (m.relations?.edges || [])
        .filter((e: any) => e.node?.id && (e.node.title?.english || e.node.title?.romaji))
        .map((e: any) => ({
          id: e.node.id,
          mal_id: e.node.idMal,
          type: e.relationType || "RELATED",
          title: e.node.title?.english || e.node.title?.romaji || e.node.title?.native || "",
          image: e.node.coverImage?.large || null,
          episodes: e.node.episodes || null,
          format: e.node.format || null,
        })),
      status: m.status || null,
      episodes: m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : null),
      rating: null,
      year: m.startDate?.year || null,
      season: m.season || null,
      format: m.format || null,
      start_date: m.startDate ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
    };
  } catch {
    return null;
  }
}

export async function searchAnimeClient(params: SearchAnimeParams): Promise<AnimeSummary[]> {
  const page = params.page || 1;
  const perPage = params.perPage || 20;
  const q = params.query || "";
  const useSearch = q.length > 0 && q.toLowerCase() !== "anime";

  let sortVal = "SEARCH_MATCH";
  if (params.orderBy && SEARCH_SORT_MAP[params.orderBy]) sortVal = SEARCH_SORT_MAP[params.orderBy];
  if (params.sort === "asc" && SEARCH_ASC_MAP[sortVal]) sortVal = SEARCH_ASC_MAP[sortVal];
  if (!useSearch && sortVal === "SEARCH_MATCH") sortVal = "POPULARITY_DESC";

  const genres = params.genres ? params.genres.split(",").map((g) => g.trim()).filter(Boolean) : null;
  const status = params.status && SEARCH_STATUS_MAP[params.status] ? SEARCH_STATUS_MAP[params.status] : null;
  const format = params.type && SEARCH_FORMAT_MAP[params.type] ? [SEARCH_FORMAT_MAP[params.type]] : null;
  const year = params.year && /^\d{4}$/.test(params.year) ? parseInt(params.year) : null;
  const season = params.season && ["WINTER", "SPRING", "SUMMER", "FALL"].includes(params.season.toUpperCase())
    ? params.season.toUpperCase()
    : null;

  // AniList returns 500/empty when these args are passed as null, so only
  // include the ones that actually have values (mirrors the old /api/v1/search route).
  const varDecls = ["$page:Int", "$perPage:Int", "$sort:[MediaSort]"];
  const mediaArgs = ["type:ANIME", "countryOfOrigin:JP", "isAdult:false", "sort:$sort"];
  const variables: Record<string, any> = { page, perPage, sort: [sortVal] };
  if (useSearch) { varDecls.push("$search:String"); mediaArgs.unshift("search:$search"); variables.search = q; }
  if (genres?.length) { varDecls.push("$genre_in:[String]"); mediaArgs.push("genre_in:$genre_in"); variables.genre_in = genres; }
  if (status) { varDecls.push("$status:MediaStatus"); mediaArgs.push("status:$status"); variables.status = status; }
  if (format?.length) { varDecls.push("$format_in:[MediaFormat]"); mediaArgs.push("format_in:$format_in"); variables.format_in = format; }
  if (year) { varDecls.push("$seasonYear:Int"); mediaArgs.push("seasonYear:$seasonYear"); variables.seasonYear = year; }
  if (season) { varDecls.push("$season:MediaSeason"); mediaArgs.push("season:$season"); variables.season = season; }

  const query = `query(${varDecls.join(",")}){
  Page(page:$page,perPage:$perPage){
    media(${mediaArgs.join(",")}){
      ${MEDIA_FIELDS}
    }
  }
}`;

  const resp = await fetch(ANILIST_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const media = data?.data?.Page?.media || [];
  return media
    .filter((m: any) => m.title?.english || m.title?.romaji)
    .map(normalizeAnilistMedia);
}
