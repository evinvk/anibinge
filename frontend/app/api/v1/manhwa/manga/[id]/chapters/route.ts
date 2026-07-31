import { NextResponse } from "next/server";
import { getChapters as getChaptersMD } from "../../../_mangadex";
import { getChapters as getChaptersCK } from "../../../_comick";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await getChaptersMD(id).catch(() => getChaptersCK(id));
    return NextResponse.json({ data: data.data });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
