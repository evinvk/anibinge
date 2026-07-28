import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GOGO_API = "https://gogoanimehd.to";

export async function GET(req: Request) {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const slugIdx = segments.indexOf("gogoanime") + 1;
  const slug = segments[slugIdx];

  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  try {
    const resp = await fetch(
      `${GOGO_API}/api/episode/${slug}/ep-1`,
      { headers: { "User-Agent": UA, Referer: `${GOGO_API}/` }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await resp.json();
    const info = data.animeInfo || {};

    return NextResponse.json({
      data: {
        slug,
        title: data.animeTitle || info.title || "",
        title_english: null,
        title_japanese: null,
        poster: data.animeImage || null,
        score: info.rating ? parseFloat(info.rating) : null,
        type: info.type || data.type || null,
        status: typeof info.status === "string" ? info.status : null,
        synopsis: info.synopsis || null,
        genres: Array.isArray(info.genres) ? info.genres : [],
        studios: Array.isArray(info.studios) ? info.studios : [],
        episodes_count: info.totalEpisodes && info.totalEpisodes !== "?" ? parseInt(info.totalEpisodes) : null,
        latest_episode: data.animeId ? null : null,
        duration: info.duration || null,
        has_next_episode: data.hasNextEpisode || false,
        next_episode: data.nextEpisode?.title || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
