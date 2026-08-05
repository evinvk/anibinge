import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { chmodSync, existsSync } from "fs";
import { fetchGogoApi } from "../gogoanime/_gogoanime";
import { getAnivexaStream } from "@/lib/anivexa";

export const runtime = "nodejs";
export const maxDuration = 60;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function resolveFfmpegPath(): Promise<string | null> {
  try {
    const mod = (await import("ffmpeg-static")) as unknown;
    const path =
      typeof mod === "string"
        ? mod
        : (mod as { default?: string | null }).default ?? null;
    return path;
  } catch (err) {
    console.error("ffmpeg-static import failed:", err);
    return null;
  }
}

async function runFfmpegDiag(): Promise<Response> {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    return NextResponse.json({ ok: false, error: "import failed" }, { status: 500 });
  }
  const exists = existsSync(ffmpegPath);
  if (!exists) {
    return NextResponse.json({ ok: false, path: ffmpegPath, error: "binary missing" }, { status: 500 });
  }
  let mode = "?";
  try {
    mode = JSON.stringify({ mode: (await import("fs")).statSync(ffmpegPath).mode, size: (await import("fs")).statSync(ffmpegPath).size });
  } catch {
    // ignore
  }
  return await new Promise((resolve) => {
    const out: string[] = [];
    const errOut: string[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(
        NextResponse.json({
          ok: true,
          path: ffmpegPath,
          mode,
          stdout: out.join("").slice(0, 4000),
          stderr: errOut.join("").slice(0, 4000),
        })
      );
    };
    let child;
    try {
      child = spawn(ffmpegPath, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      return resolve(
        NextResponse.json(
          { ok: false, path: ffmpegPath, error: `spawn threw: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 }
        )
      );
    }
    child.stdout.on("data", (d: Uint8Array) => out.push(Buffer.from(d).toString("utf8")));
    child.stderr.on("data", (d: Uint8Array) => errOut.push(Buffer.from(d).toString("utf8")));
    child.on("error", (err) => {
      errOut.push(`[spawn error] ${err.message}`);
    });
    child.on("close", (code) => {
      errOut.push(`[exit ${code}]`);
      finish();
    });
    setTimeout(finish, 20000);
  });
}

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

function writeToStream(stream: NodeJS.WritableStream, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      stream.removeListener("drain", onDrain);
      reject(err);
    };
    const onDrain = () => {
      stream.removeListener("error", onError);
      resolve();
    };
    try {
      stream.once("error", onError);
      if (stream.write(chunk)) {
        stream.removeListener("error", onError);
        resolve();
      } else {
        stream.once("drain", onDrain);
      }
    } catch (err) {
      stream.removeListener("error", onError);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleDownload(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function handleDownload(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const diag = searchParams.get("diag") === "1";
  if (diag) {
    return await runFfmpegDiag();
  }
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
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    return NextResponse.json({ error: "ffmpeg unavailable (import failed)" }, { status: 502 });
  }
  if (!existsSync(ffmpegPath)) {
    return NextResponse.json(
      { error: `ffmpeg binary missing at ${ffmpegPath}` },
      { status: 502 }
    );
  }
  try {
    chmodSync(ffmpegPath, 0o755);
  } catch {
    // permission may already be set
  }

  const ffmpeg = spawn(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-fflags", "+genpts",
      "-avoid_negative_ts", "make_zero",
      "-i", "pipe:0",
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c", "copy",
      "-bsf:a", "aac_adtstoasc",
      "-f", "mp4",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  if (ffmpeg.pid === undefined) {
    return NextResponse.json({ error: "ffmpeg failed to spawn" }, { status: 502 });
  }

  ffmpeg.stdin.on("error", () => {
    // EPIPE etc. when ffmpeg exits early — handled via ffmpeg 'close'
  });

  let closed = false;
  let stderrTail = "";
  ffmpeg.stderr.on("data", (d: Uint8Array) => {
    stderrTail = (stderrTail + Buffer.from(d).toString("utf8")).slice(-2000);
  });

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      ffmpeg.stdout.on("data", (chunk: Uint8Array) => {
        if (closed) return;
        if (controller.desiredSize != null && controller.desiredSize <= 0) {
          ffmpeg.stdout.pause();
        }
        controller.enqueue(chunk);
      });
      ffmpeg.stdout.on("error", (err) => {
        if (!closed) {
          closed = true;
          controller.error(err);
        }
      });
      ffmpeg.on("error", (err) => {
        if (!closed) {
          closed = true;
          controller.error(err);
        }
      });
      ffmpeg.on("close", (code) => {
        if (closed) return;
        closed = true;
        if (code === 0) controller.close();
        else controller.error(new Error(`remux failed (code ${code}): ${stderrTail || "no stderr output"}`));
      });

      const writeToStdin = async () => {
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
                  await writeToStream(ffmpeg.stdin, value);
                }
                break;
              } catch (err) {
                if (attempt === 2) throw err;
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
          }
          ffmpeg.stdin.end();
        } catch (err) {
          ffmpeg.stdin.destroy();
          ffmpeg.kill();
          if (!closed) {
            closed = true;
            controller.error(err instanceof Error ? err : new Error(String(err)));
          }
        }
      };
      void writeToStdin();
    },
    pull() {
      if (!closed && ffmpeg.stdout.isPaused()) ffmpeg.stdout.resume();
    },
    cancel() {
      closed = true;
      ffmpeg.kill();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeName}.mp4"`,
      "Content-Type": "video/mp4",
    },
  });
}
