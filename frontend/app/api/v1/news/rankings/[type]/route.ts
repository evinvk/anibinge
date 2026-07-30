import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const RANKING_TYPE_MAP: Record<string, string> = {
  "top-anime": "all",
  "top-airing": "airing",
  "top-upcoming": "upcoming",
  "top-movie": "movie",
  "top-tv": "tv",
  "top-ova": "ova",
};

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type: typeRaw } = await params;
  const type = RANKING_TYPE_MAP[typeRaw] || "all";
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/top/anime?filter=${type}&limit=25`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`Jikan ${resp.status}`);
    const data = await resp.json();
    const results = (data.data || []).map((item: any) => ({
      id: item.mal_id,
      title: item.title,
      title_english: item.title_english || null,
      image: item.images?.jpg?.large_image_url || null,
      score: item.score,
      rank: item.rank,
      episodes: item.episodes,
      type: item.type,
      status: item.status,
      genres: (item.genres || []).map((g: any) => g.name),
      synopsis: item.synopsis?.slice(0, 300) || null,
      year: item.year || null,
      url: item.url,
    }));
    return NextResponse.json({ data: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
