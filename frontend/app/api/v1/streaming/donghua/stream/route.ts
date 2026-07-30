import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto } from "../../../donghua/_animexin";

const ANIVEXA_API = "https://anivexa-api-eight.vercel.app";
const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const VIDEO_PROXY_BASE = "/api/v1/streaming/donghua/video-proxy";
const RESOLVE_BASE = "/api/v1/streaming/donghua/resolve-embed";

async function resolveTitle(q: string): Promise<number | null> {
  try {
    const query = `query($q:String){Page(page:1,perPage:1){media(search:$q,type:ANIME){id}}}`;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { q } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.Page?.media?.[0]?.id || null;
  } catch { return null; }
}

async function resolveOkRu(videoId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://ok.ru/videoembed/${videoId}`, {
      headers: { "User-Agent": UA, Referer: "https://ok.ru/" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const m = html.match(/hlsManifestUrl\\&quot;:\\&quot;(.+?)\\&quot;/);
    if (!m) return null;
    return m[1].replace(/\\\\u0026/g, "&");
  } catch { return null; }
}

async function resolveDailyMotion(videoId: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.dailymotion.com/player/metadata/video/${videoId}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.qualities?.auto?.[0]?.url || null;
  } catch { return null; }
}

function makeProxyUrl(reqUrl: string, videoUrl: string): string {
  const origin = new URL(reqUrl).origin;
  return `${origin}${VIDEO_PROXY_BASE}?url=${encodeURIComponent(videoUrl)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";
  const anilistIdParam = url.searchParams.get("anilist_id");

  // Phase 1: Try AnimeXin (primary) — scrape episode page for embedded servers
  if (slug) {
    try {
      const epPage = await fetchHtml(`/${slug}/episode-${ep}/`);
      const parsed = parseEpisodeServersAuto(epPage);
      if (parsed.servers?.length) {
        for (const server of parsed.servers) {
          const embedUrl = server.stream_url.startsWith("//")
            ? `https:${server.stream_url}`
            : server.stream_url;

          if (embedUrl.includes("ok.ru")) {
            const m = embedUrl.match(/ok\.ru\/(?:videoembed|video)\/(\d+)/);
            const videoId = m?.[1];
            if (videoId) {
              const hlsUrl = await resolveOkRu(videoId);
              if (hlsUrl) {
                return NextResponse.json({
                  data: {
                    stream_url: makeProxyUrl(req.url, hlsUrl),
                    stream_type: "hls",
                    referer: "https://animexin.dev/",
                    subtitles: [],
                    provider: "animexin-okru",
                    embed_url: embedUrl,
                  },
                });
              }
            }
            continue;
          }

          if (embedUrl.includes("dailymotion.com") || embedUrl.includes("dai.ly")) {
            const m = embedUrl.match(/video=([a-zA-Z0-9_]+)/) || embedUrl.match(/video\/([a-zA-Z0-9_]+)/);
            const videoId = m?.[1];
            if (videoId) {
              const dmUrl = await resolveDailyMotion(videoId);
              if (dmUrl) {
                return NextResponse.json({
                  data: {
                    stream_url: makeProxyUrl(req.url, dmUrl),
                    stream_type: dmUrl.includes(".m3u8") ? "hls" : "mp4",
                    referer: "https://www.dailymotion.com/",
                    subtitles: [],
                    provider: "animexin-dailymotion",
                    embed_url: embedUrl,
                  },
                });
              }
            }
          }

          // If it's already a direct video URL, return wrapped in proxy
          if (embedUrl.match(/\.(m3u8|mp4|webm)(\?|$)/i)) {
            return NextResponse.json({
              data: {
                stream_url: makeProxyUrl(req.url, embedUrl),
                stream_type: embedUrl.includes(".m3u8") ? "hls" : "mp4",
                referer: "https://animexin.dev/",
                subtitles: [],
                provider: "animexin-direct",
                embed_url: null,
              },
            });
          }
        }
      }
    } catch {
      // AnimeXin failed, fall through to Anivexa
    }
  }

  // Phase 2: Fallback — Anivexa multi-provider (original logic)
  let anilistId = anilistIdParam ? parseInt(anilistIdParam) : null;
  if (!anilistId && slug) anilistId = await resolveTitle(slug);

  if (anilistId) {
    try {
      const providers = ["anidbapp", "anikoto", "animegg", "anizone"];
      for (const provider of providers) {
        try {
          const resp = await fetch(
            `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${provider}-${ep}`,
            { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) }
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
              data: {
                stream_url: streamUrl,
                stream_type: streamUrl?.endsWith(".mp4") ? "mp4" : "hls",
                referer: `https://${provider}.app/`,
                subtitles,
                provider,
                embed_url: data.embed_url || null,
              },
            });
          }
        } catch { continue; }
      }
    } catch {}
  }

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
