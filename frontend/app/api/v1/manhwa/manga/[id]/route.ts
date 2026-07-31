import { NextResponse } from "next/server";
import { getMangaDetail as getMangaDetailMD, getMangaRating, CACHE_HEADERS } from "../../_mangadex";
import { getMangaDetail as getMangaDetailCK } from "../../_comick";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await getMangaDetailMD(id).catch(() => getMangaDetailCK(id));
    if (detail.rating == null) {
      detail.rating = await getMangaRating(id).catch(() => null);
    }
    return NextResponse.json({ data: detail }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
