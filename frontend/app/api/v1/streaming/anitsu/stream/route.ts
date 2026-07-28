import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const ep = parseInt(new URL(req.url).searchParams.get("ep") || "1");

  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  try {
    // Anitsu (AnimeXin) is typically blocked by Cloudflare from Vercel IPs.
    // This fallback is rarely successful but kept for compatibility.
    const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const resp = await fetch(`https://animexin.dev/${slug}-episode-${ep}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const html = await resp.text();
    // Try to extract stream URL from the page
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
