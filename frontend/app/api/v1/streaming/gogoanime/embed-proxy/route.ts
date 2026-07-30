import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const ALLOWED_HOSTS = new Set([
  "gogocdn.net", "gogostream.com", "gogohd.net", "gogoanimehd.to",
  "megap.kotocdn.site", "fxpy7.watching.onl", "1oe.lostproject.club",
  "hls.anidb.app", "anidb.app", "ani.pm", "cdn.ani.pm",
  "megaplay.buzz", "vidtube.site", "vidwish.live",
  "anivexa-api-eight.vercel.app",
]);

function base64UrlDecode(s: string): string {
  try {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return atob(s);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const encodedUrl = url.searchParams.get("url") || "";
  const referer = url.searchParams.get("referer") || "";

  const decodedUrl = base64UrlDecode(encodedUrl);
  if (!decodedUrl) return NextResponse.json({ error: "Invalid encoding" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(decodedUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const host = parsed.hostname;
  const allowed = [...ALLOWED_HOSTS].some((h) => host === h || host.endsWith("." + h));
  if (!allowed) return NextResponse.json({ error: "Host not allowed" }, { status: 403 });

  const upstreamReferer = referer || "https://megaplay.buzz/";
  try {
    const resp = await fetch(decodedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: upstreamReferer,
        Origin: upstreamReferer.replace(/\/$/, ""),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return NextResponse.json({ error: `Upstream ${resp.status}` }, { status: resp.status });

    const contentType = resp.headers.get("content-type") || "";
    const body = await resp.text();

    if (contentType.includes("mpegurl") || body.trim().startsWith("#EXTM3U")) {
      const lines = body.split("\n");
      const rewritten: string[] = [];
      const proxyBase = "/api/v1/streaming/gogoanime/embed-proxy";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const stripped = line.trim();

        if (stripped && !stripped.startsWith("#")) {
          const resolved = stripped.startsWith("http") ? stripped : new URL(stripped, decodedUrl).href;
          const encoded = btoa(resolved).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
          const refEnc = btoa(upstreamReferer).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
          rewritten.push(`${proxyBase}?url=${encoded}&referer=${refEnc}`);
        } else {
          rewritten.push(line);
        }
      }

      return new Response(rewritten.join("\n"), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=10",
        },
      });
    }

    // Binary content — stream through
    const binResp = await fetch(decodedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: upstreamReferer,
        Origin: upstreamReferer.replace(/\/$/, ""),
      },
      signal: AbortSignal.timeout(30000),
    });
    const blob = await binResp.blob();
    return new Response(blob, {
      headers: {
        "Content-Type": contentType || "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
        ...(binResp.headers.get("content-length") ? { "Content-Length": binResp.headers.get("content-length")! } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
