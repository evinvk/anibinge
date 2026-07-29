import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET(req: Request) {
  try {
    const data = await fetchGogoApi("/api/home");
    const episodes = data?.latest_episodes || data?.recent_episodes || data?.ongoing || [];
    return NextResponse.json({
      data: Array.isArray(episodes) ? episodes.map((e: any) => ({
        slug: e.id || e.slug || "",
        title: e.title || "",
        poster: e.poster || e.image || null,
        episode: e.episode || e.latest_episode || null,
      })) : [],
    });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
