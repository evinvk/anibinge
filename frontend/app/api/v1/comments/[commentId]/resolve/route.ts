import { NextRequest, NextResponse } from "next/server";
import { toggleResolve } from "@/lib/comments-store";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  }
  try {
    const result = toggleResolve(parseInt(commentId));
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
