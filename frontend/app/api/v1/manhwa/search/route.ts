import { NextResponse } from "next/server";
import { searchManga, SEARCH_CACHE_HEADERS } from "../_mangadex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ data: [] });
  try {
    const data = await searchManga(q);
    return NextResponse.json({ data: data.data, query: q }, { headers: SEARCH_CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [], query: q }, { status: 500 });
  }
}
