import { NextResponse } from "next/server";
import { getChapterPages as getChapterPagesMD } from "../../_mangadex";
import { getChapterPages as getChapterPagesCK } from "../../_comick";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await getChapterPagesMD(id).catch(() => getChapterPagesCK(id));
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
