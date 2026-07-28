import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "https://anibinge-backend-k6td.onrender.com";

async function proxy(request: NextRequest, path: string) {
  const url = new URL(request.url);
  url.searchParams.delete("_t");
  const qs = url.searchParams.toString();
  const target = `${BACKEND_URL}/api/v1/comments${path}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;
  const ct = request.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  try {
    const resp = await fetch(target, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { detail: `Comments backend unavailable: ${e.message}` },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return proxy(request, "");
}

export async function POST(request: NextRequest) {
  return proxy(request, "");
}
