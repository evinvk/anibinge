import { NextResponse } from "next/server";
import { fetchGogoApi, GOGO_BASE } from "../../_gogoanime";
import { getAnivexaStream } from "@/lib/anivexa";

function dubSlug(slug: string, audio: string): string {
  return audio === "dub" ? (slug.endsWith("-dub") ? slug : `${slug}-dub`) : slug.replace(/-dub$/, "");
}

function anilistIdFromServerId(serverId: string | null | undefined): number | null {
  if (!serverId) return null;
  const m = serverId.match(/anineko\/(\d+)\//);
  return m ? parseInt(m[1]) : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const slugIdx = segments.indexOf("gogoanime") + 1;
  const rawSlug = segments[slugIdx];
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";
  const slug = dubSlug(rawSlug, audio);

  if (!slug) return NextResponse.json({ data: null });

  try {
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

    if (data.sources?.length) {
      result.qualities = data.sources.map((s: any) => ({
        quality: s.label || s.quality || "Auto",
        url: s.url || s.file,
      }));
      result.master_m3u8 = data.sources.map((s: any) =>
        `#EXT-X-STREAM-INF:BANDWIDTH=${s.bandwidth || 0},RESOLUTION=${s.label || ""}\n${s.url || s.file}`
      ).join("\n");
    } else if (data.defaultStreamingUrl) {
      result.direct_stream = { stream_url: new URL(data.defaultStreamingUrl, GOGO_BASE).href, referer: `${GOGO_BASE}/` };
    } else if (data.embed_url) {
      result.embed_url = data.embed_url;
    }

    return NextResponse.json({ data: Object.keys(result).length ? result : null });
  } catch {
    return NextResponse.json({ data: null });
  }
}
