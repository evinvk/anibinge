import { NextRequest, NextResponse } from "next/server";
import { getRatingSummary, upsertRating, deleteRating } from "@/lib/ratings-store";
import { getUserId } from "@/lib/auth-route";

export async function GET(req: NextRequest) {
  const animeId = parseInt(req.nextUrl.searchParams.get("anime_id") || "");
  const source = req.nextUrl.searchParams.get("source") || "mal";
  if (isNaN(animeId)) return NextResponse.json({ error: "Invalid anime_id" }, { status: 400 });
  try {
    const result = await getRatingSummary(animeId, source, getUserId(req));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-cache" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  const animeId = parseInt(body.anime_id);
  const rating = parseInt(body.rating);
  const source = body.source || "mal";
  if (isNaN(animeId) || isNaN(rating) || rating < 1 || rating > 10) {
    return NextResponse.json({ detail: "anime_id and rating (1-10) are required" }, { status: 400 });
  }
  try {
    const result = await upsertRating(userId, animeId, source, rating);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  const animeId = parseInt(req.nextUrl.searchParams.get("anime_id") || "");
  const source = req.nextUrl.searchParams.get("source") || "mal";
  if (isNaN(animeId)) return NextResponse.json({ detail: "Invalid anime_id" }, { status: 400 });
  try {
    const result = await deleteRating(userId, animeId, source);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 });
  }
}
