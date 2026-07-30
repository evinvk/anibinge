import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto, parseDetailAuto, BASE } from "../../../donghua/_animexin";

const ANIVEXA_API = "https://anivexa-api-eight.vercel.app";
const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";
  const anilistIdParam = url.searchParams.get("anilist_id");

  if (slug) {
    try {
      const detailRes = await fetchHtml(`/${slug}/`);
      const detail = parseDetailAuto(detailRes, slug);
      const epEntry = detail.episode_list?.find((e: any) => e.number === ep);
      const epUrl = epEntry?.url?.replace(BASE, "") || `/${slug}/episode-${ep}/`;

      const epPage = await fetchHtml(epUrl);
      const parsed = parseEpisodeServersAuto(epPage);
      if (parsed.servers?.length) {
        const servers = parsed.servers.map((s: any) => ({
          label: s.label || "Server",
          stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
        }));
        return NextResponse.json({ data: { servers } });
      }
    } catch {}
  }

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
            }));
            return NextResponse.json({
              data: { stream_url: streamUrl, stream_type: streamUrl?.endsWith(".mp4") ? "mp4" : "hls", referer: `https://${provider}.app/`, subtitles, provider, servers: [] },
            });
          }
        } catch { continue; }
      }
    } catch {}
  }

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
