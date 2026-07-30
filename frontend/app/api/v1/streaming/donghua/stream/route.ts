import { NextResponse } from "next/server";

const BACKEND = "https://anibinge-backend-k6td.onrender.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!slug) return NextResponse.json({ error: "No slug" }, { status: 400 });

  try {
    const backendUrl = `${BACKEND}/api/v1/donghua/anime/${encodeURIComponent(slug)}/episode/${ep}`;
    const resp = await fetch(backendUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data?.data?.servers?.length) {
        return NextResponse.json(data);
      }
    }
  } catch (e: any) {
    // Backend unreachable (cold start or down)
  }

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
