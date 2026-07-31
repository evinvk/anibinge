import { NextResponse } from "next/server";
import { getLatest, CACHE_HEADERS } from "../_mangadex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const data = await getLatest(page);
    return NextResponse.json({ data: data.data, page }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [], page }, { status: 500 });
  }
}
