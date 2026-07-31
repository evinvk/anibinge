import { NextResponse } from "next/server";
import { getLatest as getLatestMD, CACHE_HEADERS } from "../_mangadex";
import { getLatest as getLatestCK } from "../_comick";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const data = await getLatestMD(page).catch(() => getLatestCK(page));
    return NextResponse.json({ data: data.data, page }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [], page }, { status: 500 });
  }
}
