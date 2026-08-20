import { NextResponse } from "next/server";
import { searchManga as searchMangaMD, SEARCH_CACHE_HEADERS } from "../_mangadex";
import { searchManga as searchMangaCK } from "../_comick";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ data: [] });
  try {
    const data = await searchMangaMD(q)
      .then((r) => (r.data.length > 0 ? r : searchMangaCK(q)))
      .catch(() => searchMangaCK(q));
    return NextResponse.json({ data: data.data, query: q }, { headers: SEARCH_CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [], query: q }, { status: 500 });
  }
}
