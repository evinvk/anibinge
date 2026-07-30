import { NextResponse } from "next/server";

const BACKEND = "https://anibinge-backend-k6td.onrender.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; episode: string }> }
) {
  const { slug, episode } = await params;
  const epNum = parseInt(episode);
  if (isNaN(epNum)) return NextResponse.json({ error: "Invalid episode" }, { status: 400 });

  try {
    const backendUrl = `${BACKEND}/api/v1/donghua/anime/${encodeURIComponent(slug)}/episode/${epNum}`;
    const resp = await fetch(backendUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (resp.ok) {
      const data = await resp.json();
      return NextResponse.json(data);
    }
  } catch {}

  return NextResponse.json({ error: "Failed to fetch servers" }, { status: 503 });
}
