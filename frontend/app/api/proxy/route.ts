import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = [
  "megap.kotocdn.site",
  "fxpy7.watching.onl",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
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
    const isM3U8 =
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      url.endsWith(".m3u8");

    if (isM3U8) {
      let text = await resp.text();
      const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);

      text = text.replace(/^(?!#)(\S+)$/gm, (line) => {
        try {
          const absolute = line.startsWith("http://") || line.startsWith("https://")
            ? line
            : new URL(line, baseUrl).href;
          const host = new URL(absolute).hostname;
          if (!ALLOWED_HOSTS.includes(host)) return line;
          return proxyUrl(absolute, referer);
        } catch {
          return line;
        }
      });

      text = text.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
        try {
          const absolute = uri.startsWith("http://") || uri.startsWith("https://")
            ? uri
            : new URL(uri, baseUrl).href;
          const host = new URL(absolute).hostname;
          if (!ALLOWED_HOSTS.includes(host)) return _match;
          return `URI="${proxyUrl(absolute, referer)}"`;
        } catch {
          return _match;
        }
      });

      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=10",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const body = await resp.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "video/mp2t",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Proxy failed" },
      { status: 502 },
    );
  }
}
