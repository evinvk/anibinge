import { NextResponse } from "next/server";
import { enrichWithViews } from "@/lib/views";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function fetchAnilist(query: string, variables: Record<string, any>) {
  const resp = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`AniList ${resp.status}`);
  return resp.json();
}

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

const VALID_SEASONS = ["winter", "spring", "summer", "fall"] as const;

const SEASONAL_QUERY = `query($season:MediaSeason,$year:Int,$page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(season:$season,seasonYear:$year,type:ANIME,countryOfOrigin:JP,isAdult:false,sort:POPULARITY_DESC){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status
      genres description
      startDate{year month day} season format
    }
  }
}`;

const SEASON_MAP: Record<string, string> = {
  winter: "WINTER", spring: "SPRING", summer: "SUMMER", fall: "FALL",
};

export async function GET(req: Request, { params }: { params: Promise<{ year: string; season: string }> }) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const { year, season } = await params;
  const yearNum = parseInt(year);
  const seasonLower = season.toLowerCase();

  if (!VALID_SEASONS.includes(seasonLower as any)) {
    return NextResponse.json({ error: `Invalid season. Must be: ${VALID_SEASONS.join(", ")}` }, { status: 400 });
  }
  if (isNaN(yearNum) || yearNum < 1917 || yearNum > new Date().getFullYear() + 2) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const data = await fetchAnilist(SEASONAL_QUERY, { season: SEASON_MAP[seasonLower], year: yearNum, page, perPage: 30 });
    const media = data?.data?.Page?.media || [];
    const results = media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
    return NextResponse.json({ data: enrichWithViews(results), season: seasonLower, year: yearNum });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
