import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ data: [] });

  try {
    const resp = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&sfw&limit=20`,
      { headers: { "User-Agent": UA } }
    );
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const results = (data.data || []).map((d: any) => ({
      id: d.mal_id,
      source: "mal",
      title: d.title || "",
      title_english: d.title_english || null,
      image: d.images?.jpg?.image_url || null,
      banner: d.trailer?.images?.maximum_image_url || null,
      score: d.score || null,
      popularity: d.popularity || null,
      episodes: d.episodes || null,
      status: d.status || null,
      genres: (d.genres || []).map((g: any) => g.name),
      synopsis: d.synopsis?.slice(0, 500) || null,
      year: d.year || null,
      season: d.season || null,
      format: d.type || null,
      start_date: d.aired?.from?.split("T")[0] || null,
    }));
    return NextResponse.json({ data: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
