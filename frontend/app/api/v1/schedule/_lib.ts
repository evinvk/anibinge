const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const SCHEDULE_QUERY = `query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(type:ANIME,status:RELEASING,sort:POPULARITY_DESC){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status genres
      nextAiringEpisode{airingAt timeUntilAiring episode}
      season seasonYear format
      startDate{year month day}
      description
    }
  }
}`;

export async function fetchSchedule(page = 1, perPage = 50) {
  const resp = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query: SCHEDULE_QUERY, variables: { page, perPage } }),
  });
  if (!resp.ok) throw new Error(`AniList ${resp.status}`);
  return resp.json();
}

export const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function normalize(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  const nextEp = m.nextAiringEpisode || {};
  let airTime = null;
  let day = null;
  if (nextEp.airingAt) {
    const dt = new Date(nextEp.airingAt * 1000);
    airTime = dt.toTimeString().slice(0, 5);
    day = DAYS[dt.getUTCDay()];
  }
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
    year: m.seasonYear || m.startDate?.year || null,
    season: m.season || null,
    format: m.format || null,
    start_date: m.startDate ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
    air_time: airTime,
    next_episode: nextEp.episode || null,
    airing_at: nextEp.airingAt || null,
  };
}

export function getDay(dt: Date): string {
  return DAYS[dt.getUTCDay()];
}
