import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GOGO_API = "https://gogoanimehd.to";

function dubSlug(slug: string, audio: string): string {
  return audio === "dub" ? (slug.endsWith("-dub") ? slug : `${slug}-dub`) : slug.replace(/-dub$/, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const slugIdx = segments.indexOf("gogoanime") + 1;
  const rawSlug = segments[slugIdx];
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";
  const slug = dubSlug(rawSlug, audio);

  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  try {
    const resp = await fetch(
      `${GOGO_API}/api/episode/${slug}/ep-${ep}`,
      { headers: { "User-Agent": UA, Referer: `${GOGO_API}/` }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    const data = await resp.json();
    const proxyUrl = data?.defaultStreamingUrl;
    if (!proxyUrl) return NextResponse.json({ error: "No stream URL" }, { status: 404 });

    const m3u8Resp = await fetch(proxyUrl, {
      headers: { "User-Agent": UA, Referer: `${GOGO_API}/` },
      signal: AbortSignal.timeout(15000),
    });
    if (!m3u8Resp.ok) return NextResponse.json({ error: "M3U8 fetch failed" }, { status: 502 });

    const m3u8Text = await m3u8Resp.text();
    return new Response(m3u8Text, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=10",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
