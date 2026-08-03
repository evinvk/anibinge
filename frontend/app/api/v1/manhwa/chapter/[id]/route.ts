import { NextResponse } from "next/server";
import { getChapterPages as getChapterPagesMD } from "../../_mangadex";
import { getChapterPages as getChapterPagesCK } from "../../_comick";
import { getChapterPages as getChapterPagesAS } from "../../_asura";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (id.startsWith("asura~")) {
      const parts = id.split("~");
      const data = await getChapterPagesAS(parts[1], parts[2]);
      return NextResponse.json({ data });
    }
    const data = await getChapterPagesMD(id).catch(() => getChapterPagesCK(id));
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
