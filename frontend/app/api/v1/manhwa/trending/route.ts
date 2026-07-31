import { NextResponse } from "next/server";
import { getTrending } from "../_mangadex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const data = await getTrending(page);
    return NextResponse.json({ data: data.data, page });
  } catch (e: any) {
    return NextResponse.json({ data: [], page, error: e?.message || String(e) }, { status: 500 });
  }
}
