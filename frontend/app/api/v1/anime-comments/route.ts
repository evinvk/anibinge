import { NextRequest, NextResponse } from "next/server";
import { getAnimeComments, createAnimeComment } from "@/lib/anime-comments-store";
import { getUserId, getUserName } from "@/lib/auth-route";

export async function GET(req: NextRequest) {
  const animeId = parseInt(req.nextUrl.searchParams.get("anime_id") || "");
  const source = req.nextUrl.searchParams.get("source") || "mal";
  if (isNaN(animeId)) return NextResponse.json({ comments: [] });
  try {
    const comments = await getAnimeComments(animeId, source, getUserId(req));
    return NextResponse.json({ comments });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(req);
  const username = getUserName(req);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  const animeId = parseInt(body.anime_id);
  const source = body.source || "mal";
  if (isNaN(animeId) || !body.body) {
    return NextResponse.json({ detail: "anime_id and body are required" }, { status: 400 });
  }
  try {
    const comment = await createAnimeComment(userId, username || "User-" + userId.slice(0, 6), animeId, source, body.body);
    return NextResponse.json(comment, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 400 });
  }
}
