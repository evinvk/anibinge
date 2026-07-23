import { NextRequest } from "next/server";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

const BLOCKED_IP_RE = /^((10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::ffff:(127|10|172\.(1[6-9]|2\d|3[01])|192\.168)\.))/

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return BLOCKED_IP_RE.test(hostname);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function proxyUrl(target: string, referer: string) {
  return `/api/proxy?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const referer = req.nextUrl.searchParams.get("referer") || "";

  if (!url) {
    return Response.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Response.json({ error: "Only http/https" }, { status: 403 });
  }

  if (isBlockedHost(parsed.hostname)) {
    return Response.json({ error: "Blocked host" }, { status: 403 });
  }

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        ...(referer ? { Referer: referer } : {}),
      },
    });

    if (!resp.ok) {
      return Response.json({ error: `Upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("Content-Type") || "";
    const isM3U8 =
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      url.endsWith(".m3u8");

    if (isM3U8 && resp.body) {
      const text = await resp.text();
      const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);

      let rewritten = text.replace(/^(?!#)(\S+)$/gm, (line) => {
        try {
          const absolute = line.startsWith("http://") || line.startsWith("https://")
            ? line
            : new URL(line, baseUrl).href;
          return proxyUrl(absolute, referer);
        } catch {
          return line;
        }
      });

      rewritten = rewritten.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
        try {
          const absolute = uri.startsWith("http://") || uri.startsWith("https://")
            ? uri
            : new URL(uri, baseUrl).href;
          return `URI="${proxyUrl(absolute, referer)}"`;
        } catch {
          return _match;
        }
      });

      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=10",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!resp.body) {
      return new Response(null, { status: resp.status });
    }

    return new Response(resp.body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "video/mp2t",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return Response.json(
      { error: e.message || "Proxy failed" },
      { status: 502 },
    );
  }
}
