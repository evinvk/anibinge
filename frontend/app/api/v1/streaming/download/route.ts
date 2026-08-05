import { NextRequest, NextResponse } from "next/server";
import { fetchGogoApi } from "../gogoanime/_gogoanime";
import { getAnivexaStream } from "@/lib/anivexa";

export const maxDuration = 60;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function dubSlug(slug: string, audio: string): string {
  return audio === "dub" ? (slug.endsWith("-dub") ? slug : `${slug}-dub`) : slug.replace(/-dub$/, "");
}

function anilistIdFromServerId(serverId: string | null | undefined): number | null {
  if (!serverId) return null;
  const m = serverId.match(/anineko\/(\d+)\//);
  return m ? parseInt(m[1], 10) : null;
}

async function parseHlsSegments(playlistUrl: string, referer: string): Promise<string[]> {
  const headers = { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) };

  const resp = await fetch(playlistUrl, { headers, redirect: "follow" });
  if (!resp.ok) return [];
  let text = await resp.text();
  let baseUrl = playlistUrl;

  const lines = text.split(/\r?\n/);
  const isMaster = lines.some((l) => l.includes("#EXT-X-STREAM-INF"));

  if (isMaster) {
    let bestBw = -1;
    let bestUrl: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
      let bw = 0;
      for (const part of line.split(",")) {
        if (part.startsWith("BANDWIDTH=")) {
          bw = parseInt(part.split("=")[1]?.trim() || "0", 10) || 0;
        }
      }
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith("#"))) j++;
      if (j < lines.length && bw > bestBw) {
        bestBw = bw;
        bestUrl = new URL(lines[j].trim(), baseUrl).href;
      }
      i = j;
    }
    if (!bestUrl) return [];
    const vresp = await fetch(bestUrl, { headers, redirect: "follow" });
    if (!vresp.ok) return [];
    text = await vresp.text();
    baseUrl = bestUrl;
  }

  const segments: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith("#")) {
      segments.push(new URL(line, baseUrl).href);
    }
  }
  return segments;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSlug = searchParams.get("slug");
  const anilistIdParam = searchParams.get("anilist_id");
  const ep = parseInt(searchParams.get("ep") || "1", 10) || 1;
  const audio = searchParams.get("audio") || "sub";
  const filename = searchParams.get("filename") || "episode";

  let anilistId = anilistIdParam ? parseInt(anilistIdParam, 10) : null;

  if (!anilistId && rawSlug) {
    try {
      const slug = dubSlug(rawSlug, audio);
      const data = await fetchGogoApi(`/api/episode/${slug}/ep-${ep}`, 30000);
      if (data) anilistId = anilistIdFromServerId(data.defaultServerId);
    } catch {
      anilistId = null;
    }
  }

  const stream = anilistId ? await getAnivexaStream(anilistId, ep, audio) : null;
  if (!stream?.stream_url) {
    return NextResponse.json({ error: "No streaming source available" }, { status: 404 });
  }

  const safeName = filename.replace(/[^\w-]/g, "_");
  const streamHeaders = { "User-Agent": UA, ...(stream.referer ? { Referer: stream.referer } : {}) };

  if (stream.stream_type === "mp4") {
    const resp = await fetch(stream.stream_url, { headers: streamHeaders, redirect: "follow" });
    if (!resp.ok || !resp.body) {
      return NextResponse.json({ error: "Failed to fetch source" }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="${safeName}.mp4"`);
    headers.set("Content-Type", resp.headers.get("content-type") || "video/mp4");
    const cl = resp.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    return new Response(resp.body, { headers });
  }

  const segmentUrls = await parseHlsSegments(stream.stream_url, stream.referer);
  if (!segmentUrls.length) {
    return NextResponse.json({ error: "Could not parse HLS playlist" }, { status: 502 });
  }

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for (const segUrl of segmentUrls) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const sresp = await fetch(segUrl, { headers: streamHeaders, redirect: "follow" });
              if (!sresp.ok || !sresp.body) throw new Error(`segment status ${sresp.status}`);
              const reader = sresp.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              break;
            } catch (err) {
              if (attempt === 2) throw err;
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeName}.ts"`,
      "Content-Type": "video/mp2t",
    },
  });
}
