import { NextResponse } from "next/server";
import { ssrfBlock } from "@/lib/ssrf";

const ALLOWED_HOSTS = new Set(["ok.ru", "www.ok.ru"]);

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const blocked = ssrfBlock(url);
  if (blocked) return blocked;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://ok.ru/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 });

    const body = await resp.text();
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy failed" }, { status: 502 });
  }
}
