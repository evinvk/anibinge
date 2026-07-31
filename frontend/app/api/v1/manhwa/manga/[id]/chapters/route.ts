import { NextResponse } from "next/server";
import { getChapters } from "../../../_mangadex";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await getChapters(id);
    return NextResponse.json({ data: data.data });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
