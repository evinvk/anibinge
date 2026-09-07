import { NextResponse } from "next/server";
import { ssrfBlock } from "@/lib/ssrf";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ALLOWED_HOSTS = new Set(["gogocdn.net", "embtaku.pro", "streamani.net", "vizcloud.live", "mutixcdn.com"]);

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const isAllowed = [...ALLOWED_HOSTS].some(h => hostname === h || hostname.endsWith("." + h));
  if (!isAllowed) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const blocked = ssrfBlock(url);
  if (blocked) return blocked;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const html = await resp.text();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch embed" }, { status: 502 });
  }
}
