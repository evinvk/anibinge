import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const decodedUrl = decodeURIComponent(url);
    const isM3u8 = decodedUrl.includes(".m3u8");
    const referer = req.headers.get("Referer") || "https://animexin.dev/";

    const resp = await fetch(decodedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: referer,
        Origin: new URL(decodedUrl).origin,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Upstream ${resp.status}` },
        { status: 502 }
      );
    }

    const bodyBuf = await resp.arrayBuffer();
    const bodyStr = new TextDecoder().decode(bodyBuf.slice(0, 20));
    const contentType = resp.headers.get("Content-Type") || "";
    const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf("/") + 1);
    const proxyBase = `${new URL(req.url).origin}/api/v1/streaming/donghua/video-proxy`;

    if (bodyStr.startsWith("#EXTM3U")) {
      const body = new TextDecoder().decode(bodyBuf);
      const rewritten = body.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        try {
          new URL(trimmed);
          return `${proxyBase}?url=${encodeURIComponent(trimmed)}`;
        } catch {
          const absolute = new URL(trimmed, baseUrl).href;
          return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
        }
      }).join("\n");

      return new Response(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    return new Response(bodyBuf, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Proxy failed" },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
