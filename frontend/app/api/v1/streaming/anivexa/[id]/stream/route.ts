import { NextResponse } from "next/server";

const ANIVEXA_API = "https://anivexa-api-eight.vercel.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idIdx = segments.indexOf("anivexa") + 1;
  const anilistId = parseInt(segments[idIdx]);
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";

  if (isNaN(anilistId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    // Try Anivexa providers first, skip Anitsu (which is down)
    const providers = ["anidbapp", "anikoto", "animegg", "anizone"];
    let lastError: string | null = null;

    for (const provider of providers) {
      try {
        const resp = await fetch(
          `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${provider}-${ep}`,
          { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) }
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data?.sources?.length || data?.stream_url) {
          const streamUrl = data.stream_url || data.sources?.[0]?.url;
          const subtitles = (data.subtitles || []).map((s: any) => ({
            file: s.url || s.file,
            label: s.label || s.language || "English",
            language: s.language || "en",
            kind: "captions",
            default: s.default || false,
            source: provider,
            referer: `https://${provider}.app/`,
          }));
          return NextResponse.json({
            source: "anivexa",
            provider,
            stream_url: streamUrl,
            stream_type: streamUrl?.endsWith(".mp4") ? "mp4" : "hls",
            referer: `https://${provider}.app/`,
            embed_url: data.embed_url || null,
            subtitles,
          });
        }
      } catch { lastError = "Provider failed"; }
    }

    return NextResponse.json({ error: lastError || "No stream found" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
