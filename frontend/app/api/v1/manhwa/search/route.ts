import { NextResponse } from "next/server";
import { searchManga } from "../_mangadex";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ data: [] });
  try {
    const data = await searchManga(q);
    return NextResponse.json({ data: data.data, query: q });
  } catch {
    return NextResponse.json({ data: [], query: q }, { status: 500 });
  }
}
