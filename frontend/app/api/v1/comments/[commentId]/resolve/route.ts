import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "https://anibinge-backend-k6td.onrender.com";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params;
  const target = `${BACKEND_URL}/api/v1/comments/${commentId}/resolve`;
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  const auth = request.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  try {
    const resp = await fetch(target, {
      method: "PATCH",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ detail: `Comments backend unavailable: ${e.message}` }, { status: 502 });
  }
}
