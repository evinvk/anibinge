import { NextResponse } from "next/server";
import { getReviews } from "../_ann";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const animeId = url.searchParams.get("anime_id") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const data = await getReviews(animeId, page);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
