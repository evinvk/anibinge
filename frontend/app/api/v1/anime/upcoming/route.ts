import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const UPCOMING_QUERY = `
query($page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(status:NOT_YET_RELEASED,sort:START_DATE_DESC,type:ANIME,isAdult:false){
      id idMal title{english romaji native}
      coverImage{large} bannerImage
      averageScore popularity episodes status
      genres description
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
    start_date: m.startDate ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const resp = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: UPCOMING_QUERY, variables: { page, perPage: 30 } }),
    });
    if (!resp.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    const results = media.filter((m: any) => m.title?.english || m.title?.romaji).map(normalizeMedia);
    return NextResponse.json({ data: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
