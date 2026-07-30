import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function tryFetchUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) return resp.text();
  } catch {}
  // Try via Jina proxy
  try {
    const proxyUrl = `https://r.jina.ai/http://animexin.dev${new URL(url).pathname}`;
    const r = await fetch(proxyUrl, {
      headers: { "User-Agent": UA, Accept: "text/html", "X-Return-Format": "text" },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return r.text();
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const ep = parseInt(new URL(req.url).searchParams.get("ep") || "1");

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const urls = [
      `https://animexin.dev/${slug}/episode-${ep}/`,
      `https://animexin.dev/${slug}-episode-${ep}`,
    ];
    let html: string | null = null;
    for (const url of urls) {
      html = await tryFetchUrl(url);
      if (html) break;
    }
    if (!html) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const playerMatch = html.match(/data-src=["']([^"']+)["']/);
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/);
    const streamUrl = playerMatch?.[1] || iframeMatch?.[1] || null;

    if (!streamUrl) return NextResponse.json({ error: "No stream found" }, { status: 404 });

    return NextResponse.json({
      source: "anitsu",
      stream_url: streamUrl,
      stream_type: "hls",
      referer: "https://animexin.dev/",
      subtitles: [],
    });
  } catch {
    return NextResponse.json({ error: "Anitsu unavailable" }, { status: 503 });
  }
}
