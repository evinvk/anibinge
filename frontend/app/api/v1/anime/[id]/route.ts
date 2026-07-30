import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const DETAIL_BY_ID = `query($id:Int){Media(id:$id,type:ANIME){
  id idMal title{english romaji native}
  coverImage{large extraLarge} bannerImage
  averageScore popularity favourites
  genres status episodes description
  startDate{year month day} season format
  trailer{id site}
  studios{edges{isMain node{name}}}
}}`;
const DETAIL_BY_MAL = `query($idMal:Int){Media(idMal:$idMal,type:ANIME){
  id idMal title{english romaji native}
  coverImage{large extraLarge} bannerImage
  averageScore popularity favourites
  genres status episodes description
  startDate{year month day} season format
  trailer{id site}
  studios{edges{isMain node{name}}}
}}`;

async function fetchGraphQL(query: string, variables: Record<string, any>) {
  const resp = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`AniList ${resp.status}`);
  return resp.json();
}

function denormalizeAnilist(m: any) {
  const title = m.title?.english || m.title?.romaji || m.title?.native || "";
  return {
    mal_id: m.idMal,
    anilist_id: m.id,
    title,
    title_english: m.title?.english || null,
    title_japanese: m.title?.native || null,
    images: { jpg: { large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || null } },
    trailer: m.trailer ? { images: { maximum_image_url: m.bannerImage || null } } : null,
    score: m.averageScore ? m.averageScore / 10 : null,
    popularity: m.popularity || null,
    members: m.favourites || null,
    genres: (m.genres || []).map((g: string) => ({ mal_id: null, name: g })),
    synopsis: m.description?.replace(/<br>/g, "\n").replace(/<[^>]*>/g, "") || null,
    studios: (m.studios?.edges || [])
      .filter((e: any) => e.isMain)
      .map((e: any) => ({ name: e.node.name })),
    status: m.status || null,
    episodes: m.episodes || null,
    rating: null,
    year: m.startDate?.year || null,
    season: m.season || null,
    format: m.format || null,
    start_date: m.startDate ? `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, "0")}-${String(m.startDate.day || 1).padStart(2, "0")}` : null,
  };
}

async function fromAnilist(id: number, byMal = false): Promise<any | null> {
  try {
    const q = byMal ? DETAIL_BY_MAL : DETAIL_BY_ID;
    const vars = byMal ? { idMal: id } : { id };
    const data = await fetchGraphQL(q, vars);
    const m = data?.data?.Media;
    if (!m) return null;
    return denormalizeAnilist(m);
  } catch { return null; }
}

async function fromJikan(id: number): Promise<any | null> {
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/full`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const d = data?.data;
    if (!d) return null;
    return {
      mal_id: d.mal_id,
      anilist_id: null,
      title: d.title || "",
      title_english: d.title_english || null,
      title_japanese: d.title_japanese || null,
      images: d.images || {},
      trailer: d.trailer || null,
      score: d.score || null,
      popularity: d.popularity || null,
      members: d.members || null,
      genres: (d.genres || []).map((g: any) => ({ mal_id: g.mal_id, name: g.name })),
      synopsis: d.synopsis || null,
      studios: (d.studios || []).map((s: any) => ({ name: s.name })),
      status: d.status || null,
      episodes: d.episodes || null,
      rating: d.rating || null,
      year: d.year || null,
      season: d.season || null,
      format: d.type || null,
      start_date: d.aired?.from?.split("T")[0] || null,
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = parseInt(segments[segments.length - 1]);
  const source = url.searchParams.get("source") || "mal";

  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let result: any;
  if (source === "anilist") {
    // Use as AniList ID directly
    result = await fromAnilist(id, false);
    if (!result) result = await fromAnilist(id, true);
  } else {
    // Try as MAL ID first
    result = await fromAnilist(id, true);
    if (!result) result = await fromAnilist(id, false);
  }

  // Fallback to Jikan
  if (!result) result = await fromJikan(id);

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data: result });
}
