import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  try {
    const data = await fetchGogoApi(`/api/search?keyword=&page=${page}`, 30000);
    const items = Array.isArray(data) ? data : data.items || [];
    return NextResponse.json({
      data: items.map((e: any) => ({
        slug: e.slug || "",
        title: e.title_english || e.title || "",
        poster: e.poster || null,
        score: e.score ? parseFloat(e.score) : null,
        type: e.type || null,
        status: e.status || null,
        episodes_count: e.episodes_count || null,
        latest_episode: e.latest_episode || null,
      })),
    });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
