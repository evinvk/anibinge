import { NextResponse } from "next/server";
import { fetchGogoApi, GOGO_BASE } from "../../_gogoanime";

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

  if (!slug) return NextResponse.json({ data: null });

  try {
    const data = await fetchGogoApi(`/api/episode/${slug}/ep-${ep}`, 15000);
    if (!data) return NextResponse.json({ data: null });

    const result: any = {};

    if (data.defaultStreamingUrl) {
      result.direct_stream = { stream_url: data.defaultStreamingUrl, referer: `${GOGO_BASE}/` };
    } else if (data.sources?.length) {
      result.qualities = data.sources.map((s: any) => ({
        quality: s.label || s.quality || "Auto",
        url: s.url || s.file,
      }));
      result.master_m3u8 = data.sources.map((s: any) =>
        `#EXT-X-STREAM-INF:BANDWIDTH=${s.bandwidth || 0},RESOLUTION=${s.label || ""}\n${s.url || s.file}`
      ).join("\n");
    } else if (data.embed_url) {
      result.embed_url = data.embed_url;
    }

    return NextResponse.json({ data: Object.keys(result).length ? result : null });
  } catch {
    return NextResponse.json({ data: null });
  }
}
