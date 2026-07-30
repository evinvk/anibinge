import { NextResponse } from "next/server";
import { getMangaDetail, getMangaRating } from "../../_mangadex";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await getMangaDetail(id);
    const rating = await getMangaRating(id).catch(() => null);
    return NextResponse.json({ data: { ...detail, rating } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
