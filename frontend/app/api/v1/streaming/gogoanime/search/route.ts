import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  try {
    const data = await fetchGogoApi(`/api/search/live?q=${encodeURIComponent(q)}`);
    const items = Array.isArray(data) ? data : data.data || [];
    return NextResponse.json({
      data: items.map((it: any) => ({
        slug: it.slug || "",
        title: it.title || "",
        title_english: it.title_english || null,
        title_japanese: it.title_japanese || null,
        poster: it.poster || null,
        score: it.score ? parseFloat(it.score) : null,
        type: it.type || null,
        status: it.status || null,
        episodes_count: it.episodes_count || it.actual_episodes_count || null,
        latest_episode: it.latest_episode || null,
      })),
    });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
