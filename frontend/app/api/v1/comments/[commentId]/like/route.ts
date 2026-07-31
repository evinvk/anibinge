import { NextRequest, NextResponse } from "next/server";
import { toggleLike } from "@/lib/comments-store";

function decodeToken(token: string): { sub?: string } {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  }
  const token = auth.slice(7);
  const userId = decodeToken(token).sub;
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  try {
    const result = await toggleLike(parseInt(commentId), userId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
