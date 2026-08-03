import { NextResponse } from "next/server";
import { getMangaDetail as getMangaDetailMD, getMangaRating, CACHE_HEADERS } from "../../_mangadex";
import { getMangaDetail as getMangaDetailCK, resolveHidByTitle } from "../../_comick";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await getMangaDetailMD(id).catch(() => getMangaDetailCK(id));
    if (detail.rating == null) {
      detail.rating = await getMangaRating(id).catch(() => null);
    }
    if (detail.officialUrl == null) {
      const hid = await resolveHidByTitle(detail.title).catch(() => null);
      if (hid) {
        const ck = await getMangaDetailCK(hid).catch(() => null);
        if (ck?.officialUrl) detail.officialUrl = ck.officialUrl;
      }
    }
    return NextResponse.json({ data: detail }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
