import { NextResponse } from "next/server";
import { fetchGogoApi, resolveGogoSlug, GOGO_BASE } from "../../_gogoanime";
import { getAnivexaStream } from "@/lib/anivexa";

function dubSlug(slug: string, audio: string): string {
  return audio === "dub" ? (slug.endsWith("-dub") ? slug : `${slug}-dub`) : slug.replace(/-dub$/, "");
}

function anilistIdFromServerId(serverId: string | null | undefined): number | null {
  if (!serverId) return null;
  const m = serverId.match(/anineko\/(\d+)\//);
  return m ? parseInt(m[1]) : null;
}

function extractStreamFromProxyUrl(proxyUrl: string): { url: string; referer: string } | null {
  try {
    if (proxyUrl.startsWith("/api/proxy")) {
      const u = new URL(proxyUrl, GOGO_BASE);
      const actual = u.searchParams.get("url");
      const referer = u.searchParams.get("referer") || "";
      if (actual) return { url: actual, referer };
    }
    return { url: proxyUrl, referer: `${GOGO_BASE}/` };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const slugIdx = segments.indexOf("gogoanime") + 1;
  const rawSlug = segments[slugIdx];
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";

  if (!rawSlug) return NextResponse.json({ data: null });

  try {
    const resolved = await resolveGogoSlug(rawSlug);
    const slug = dubSlug(resolved, audio);
    const data = await fetchGogoApi(`/api/episode/${slug}/ep-${ep}`, 30000);
    if (!data) return NextResponse.json({ data: null });

    const result: any = {};

    const anilistId = anilistIdFromServerId(data.defaultServerId);
    if (anilistId) {
      result.anilist_id = anilistId;
      const stream = await getAnivexaStream(anilistId, ep, audio);
      if (stream?.stream_url) {
        result.direct_stream = { stream_url: stream.stream_url, referer: stream.referer };
        return NextResponse.json({ data: result });
      }
    }

    if (data.server?.qualities?.length) {
      const serverList: any[] = [];
      for (const quality of data.server.qualities) {
        for (const server of quality.serverList || []) {
          serverList.push({
            quality: `${quality.title} • ${server.title}`,
            name: server.name,
            serverId: server.serverId,
          });
        }
      }
      if (serverList.length) result.servers = serverList;
    }

    if (data.defaultStreamingUrl) {
      const parsed = extractStreamFromProxyUrl(data.defaultStreamingUrl);
      if (parsed) {
        result.direct_stream = { stream_url: parsed.url, referer: parsed.referer };
      }
    } else if (data.embed_url) {
      result.embed_url = data.embed_url;
    }

    result.title = data.title || null;
    result.has_next = data.hasNextEpisode || false;
    result.has_prev = data.hasPrevEpisode || false;

    return NextResponse.json({ data: Object.keys(result).length ? result : null });
  } catch {
    return NextResponse.json({ data: null });
  }
}
