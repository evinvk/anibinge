import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  try {
    const resp = await fetch(
      "https://gogoanimehd.to/api/home",
      { headers: { "User-Agent": UA, Referer: "https://gogoanimehd.to/" }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return NextResponse.json({ data: [] });

    const data = await resp.json();
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
