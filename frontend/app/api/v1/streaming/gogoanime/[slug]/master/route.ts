import { NextResponse } from "next/server";
import { fetchGogoApi, GOGO_BASE, UA } from "../../_gogoanime";

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
    const data = await fetchGogoApi(`/api/episode/${slug}/ep-${ep}`, 15000);
    const streamingUrl = data?.defaultStreamingUrl;
    if (!streamingUrl) return NextResponse.json({ error: "No stream URL" }, { status: 404 });

    const m3u8Resp = await fetch(streamingUrl, {
      headers: { "User-Agent": UA, Referer: `${GOGO_BASE}/` },
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
