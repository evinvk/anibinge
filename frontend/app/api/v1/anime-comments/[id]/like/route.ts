import { NextRequest, NextResponse } from "next/server";
import { toggleAnimeCommentLike } from "@/lib/anime-comments-store";
import { getUserId } from "@/lib/auth-route";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  const idNum = parseInt(id);
  if (isNaN(idNum)) return NextResponse.json({ detail: "Invalid comment ID" }, { status: 400 });

  try {
    const result = await toggleAnimeCommentLike(idNum, userId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
