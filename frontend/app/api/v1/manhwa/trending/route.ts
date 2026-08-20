import { NextResponse } from "next/server";
import { getTrending as getTrendingMD, CACHE_HEADERS } from "../_mangadex";
import { getTrending as getTrendingCK } from "../_comick";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const data = await getTrendingMD(page).catch(() => getTrendingCK(page));
    return NextResponse.json({ data: data.data, page }, { headers: CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ data: [], page, error: e?.message || String(e) }, { status: 500 });
  }
}
