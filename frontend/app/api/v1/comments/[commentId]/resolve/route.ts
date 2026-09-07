import { NextRequest, NextResponse } from "next/server";
import { toggleResolve } from "@/lib/comments-store";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  }
  const commentIdNum = parseInt(commentId);
  if (isNaN(commentIdNum)) return NextResponse.json({ detail: "Invalid comment ID" }, { status: 400 });

  try {
    const result = await toggleResolve(commentIdNum);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
