import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = parseInt(segments[segments.length - 2]);
  const page = parseInt(url.searchParams.get("page") || "1");

  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/recommendations`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    const recs = (data.data || []).map((r: any) => ({
      id: r.entry?.mal_id,
      source: "mal",
      title: r.entry?.title || "",
      title_english: null,
      image: r.entry?.images?.jpg?.image_url || null,
      banner: null,
      score: null,
      popularity: null,
      episodes: null,
      status: null,
      genres: [],
      synopsis: null,
      year: null,
      season: null,
      format: null,
      start_date: null,
    }));
    return NextResponse.json({ data: recs });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
