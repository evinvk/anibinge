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
