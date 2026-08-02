import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";
import { cachedFetch } from "@/lib/ttl-cache";

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  try {
    const payload = await cachedFetch(
      `gogo-latest:${page}`,
      120000,
      async () => {
        const data = await fetchGogoApi(`/api/search?keyword=&page=${page}`, 30000);
        const items = Array.isArray(data) ? data : data.items || [];
        const mapped = items.map((e: any) => ({
          slug: e.slug || "",
          title: e.title_english || e.title || "",
          poster: e.poster || null,
          score: e.score ? parseFloat(e.score) : null,
          type: e.type || null,
          status: e.status || null,
          episodes_count: e.episodes_count || null,
          latest_episode: e.latest_episode || null,
        }));
        if (mapped.length === 0) throw new Error("empty catalog");
        return { data: mapped };
      },
      60000
    );
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ data: [] });
  }
}
