import { NextRequest, NextResponse } from "next/server";
import { addItem, removeItem } from "@/lib/collections-store";
import { getUserId } from "@/lib/auth-route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (isNaN(animeId) || !body.title) {
    return NextResponse.json({ detail: "anime_id and title are required" }, { status: 400 });
  }
  try {
    const result = await addItem(id, userId, {
      anime_id: animeId,
      source: body.source || "mal",
      title: body.title,
      poster: body.poster || null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  const animeId = parseInt(req.nextUrl.searchParams.get("anime_id") || "");
  const source = req.nextUrl.searchParams.get("source") || "mal";
  if (isNaN(animeId)) return NextResponse.json({ detail: "Invalid anime_id" }, { status: 400 });
  try {
    const result = await removeItem(id, userId, animeId, source);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
