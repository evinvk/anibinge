import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

const BLOCKED_IP_RE = /^((10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::ffff:(127|10|172\.(1[6-9]|2\d|3[01])|192\.168)\.))/;

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return BLOCKED_IP_RE.test(hostname);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const AD_DOMAINS = new Set([
  "p16-ad-sg.ibyteimg.com",
  "p16-ad-sg.tiktokcdn.com",
  "ad.doubleclick.net",
  "ad.lgappstv.com",
]);

function proxyUrl(target: string, referer: string) {
  return `/api/proxy?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const referer = req.nextUrl.searchParams.get("referer") || "";

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Only http/https" }, { status: 403 });
  }

  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 403 });
  }

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        ...(referer ? { Referer: referer } : {}),
      },
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream ${resp.status}` }, { status: resp.status });
    }

    const contentType = resp.headers.get("Content-Type") || "";

    // Quick check: if Content-Type & URL extension both say not-M3U8, skip body read
    const looksLikeM3U8 =
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      url.endsWith(".m3u8");

    if (looksLikeM3U8 || contentType.includes("text")) {
      // Clone so we can read the text for M3U8 detection without consuming the original body
      const text = await resp.clone().text();
      const isM3U8 = looksLikeM3U8 || text.trim().startsWith("#EXTM3U");

      if (isM3U8) {
        const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);

        const lines = text.split("\n");
        const filtered: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line === "" || line.startsWith("#")) {
            if (line.startsWith("#EXTINF")) {
              const next = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
              if (next && !next.startsWith("#")) {
                try {
                  const absolute = next.startsWith("http://") || next.startsWith("https://")
                    ? next
                    : new URL(next, baseUrl).href;
                  const host = new URL(absolute).hostname;
                  if (AD_DOMAINS.has(host) || host.endsWith(".ibyteimg.com")) {
                    i++;
                    continue;
                  }
                } catch {}
              }
            }
            filtered.push(line);
          } else {
            try {
              const absolute = line.startsWith("http://") || line.startsWith("https://")
                ? line
                : new URL(line, baseUrl).href;
              const host = new URL(absolute).hostname;
              if (AD_DOMAINS.has(host) || host.endsWith(".ibyteimg.com")) continue;
              filtered.push(proxyUrl(absolute, referer));
            } catch {
              filtered.push(line);
            }
          }
        }

        const hasRealSegments = filtered.some(
          (l) => l.startsWith("#EXTINF") || l.startsWith("#EXT-X-STREAM-INF")
        );
        if (!hasRealSegments) {
          return NextResponse.json(
            { error: "M3U8 has no real video segments after ad filtering" },
            { status: 404 }
          );
        }

        let rewritten = filtered.join("\n");

        rewritten = rewritten.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          try {
            const absolute = uri.startsWith("http://") || uri.startsWith("https://")
              ? uri
              : new URL(uri, baseUrl).href;
            const host = new URL(absolute).hostname;
            if (AD_DOMAINS.has(host) || host.endsWith(".ibyteimg.com")) return _match;
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

      // Not M3U8 — return the original body.
      // Using clone().text() above preserved resp.body for this path.
      if (!resp.body) {
        // Fallback — return the text we already have
        return new Response(text, {
          status: 200,
          headers: {
            "Content-Type": contentType || "text/plain",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      return new Response(resp.body, {
        status: 200,
        headers: {
          "Content-Type": contentType || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
          ...(resp.headers.get("Content-Length") ? { "Content-Length": resp.headers.get("Content-Length")! } : {}),
          ...(resp.headers.get("Content-Range") ? { "Content-Range": resp.headers.get("Content-Range")! } : {}),
          ...(resp.headers.get("Accept-Ranges") ? { "Accept-Ranges": resp.headers.get("Accept-Ranges")! } : {}),
        },
      });
    }

    // Content-Type is not text-like — skip body read entirely, stream directly
    if (!resp.body) {
      return new Response(null, { status: resp.status });
    }

    return new Response(resp.body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        ...(resp.headers.get("Content-Length") ? { "Content-Length": resp.headers.get("Content-Length")! } : {}),
        ...(resp.headers.get("Content-Range") ? { "Content-Range": resp.headers.get("Content-Range")! } : {}),
        ...(resp.headers.get("Accept-Ranges") ? { "Accept-Ranges": resp.headers.get("Accept-Ranges")! } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Proxy failed" },
      { status: 502 },
    );
  }
}
