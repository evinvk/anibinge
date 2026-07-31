import { NextResponse } from "next/server";
import { getMangaDetail, getMangaRating, CACHE_HEADERS } from "../../_mangadex";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await getMangaDetail(id);
    const rating = await getMangaRating(id).catch(() => null);
    return NextResponse.json({ data: { ...detail, rating } }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
