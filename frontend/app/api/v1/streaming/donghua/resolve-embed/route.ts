import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function resolveOkRu(videoId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://ok.ru/videoembed/${videoId}`, {
      headers: {
        "User-Agent": UA,
        Referer: "https://ok.ru/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    const m = html.match(/"hlsManifestUrl"\s*:\s*"([^"]+?)"/);
    if (!m) return null;

    return m[1].replace(/\\u0026/g, "&");
  } catch {
    return null;
  }
}

async function resolveDailyMotion(videoId: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.dailymotion.com/player/metadata/video/${videoId}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.qualities?.auto?.[0]?.url || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let videoUrl: string | null = null;
  let platform: string = "unknown";
  let videoId: string | null = null;

  const decoded = decodeURIComponent(url);

  if (decoded.includes("ok.ru")) {
    platform = "ok.ru";
    const m = decoded.match(/ok\.ru\/(?:videoembed|video)\/(\d+)/);
    videoId = m?.[1] || null;
    if (videoId) videoUrl = await resolveOkRu(videoId);
  } else if (decoded.includes("dailymotion.com") || decoded.includes("dai.ly")) {
    platform = "dailymotion";
    const m = decoded.match(/video=([a-zA-Z0-9_]+)/) || decoded.match(/video\/([a-zA-Z0-9_]+)/);
    videoId = m?.[1] || null;
    if (videoId) videoUrl = await resolveDailyMotion(videoId);
  }

  if (!videoUrl) {
    return NextResponse.json({ error: "Could not resolve video" }, { status: 404 });
  }

  const proxyUrl = `${new URL(req.url).origin}/api/v1/streaming/donghua/video-proxy?url=${encodeURIComponent(videoUrl)}`;

  return NextResponse.json({
    data: {
      stream_url: proxyUrl,
      original_url: videoUrl,
      platform,
      type: videoUrl.includes(".m3u8") ? "hls" : "mp4",
    },
  });
}
