const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export interface ResolvedStream {
  url: string;        // the video URL (m3u8 or mp4)
  type: "hls" | "mp4";
  referer?: string;
  label?: string;
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("video") || null;
  } catch {
    const m = url.match(/video\/([a-zA-Z0-9_]+)/);
    return m?.[1] || null;
  }
}

export async function resolveDailyMotion(
  embedUrl: string,
  baseUrl?: string
): Promise<ResolvedStream | null> {
  const videoId = extractVideoId(embedUrl) ||
    embedUrl.match(/video\/([a-zA-Z0-9_]+)/)?.[1];
  if (!videoId) return null;

  try {
    const resp = await fetch(
      `https://www.dailymotion.com/player/metadata/video/${videoId}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();

    const streamUrl = data.qualities?.auto?.[0]?.url ||
      data.qualities?.["auto"]?.[0]?.url || null;
    if (!streamUrl) return null;

    return {
      url: streamUrl,
      type: "hls",
      referer: "https://www.dailymotion.com/",
      label: "DailyMotion",
    };
  } catch {
    return null;
  }
}

export async function resolveOkRu(
  embedUrl: string,
  baseUrl?: string
): Promise<ResolvedStream | null> {
  const m = embedUrl.match(/ok\.ru\/(?:videoembed|video)\/(\d+)/);
  if (!m) return null;
  const videoId = m[1];

  try {
    const resp = await fetch(
      `${baseUrl || ""}/api/v1/streaming/donghua/embed-proxy?url=${encodeURIComponent(
        `https://ok.ru/videoembed/${videoId}`
      )}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const html = await resp.text();

    const hlsMatch = html.match(
      /"hlsManifestUrl"\s*:\s*"([^"]+)"/
    );
    if (hlsMatch) {
      const hlsUrl = hlsMatch[1].replace(/\\u0026/g, "&");
      return {
        url: hlsUrl,
        type: "hls",
        referer: "https://ok.ru/",
        label: "ok.ru HLS",
      };
    }

    const videoMatch = html.match(
      /"name"\s*:\s*"(hd|full)"[^}]*"url"\s*:\s*"([^"]+)"/
    );
    if (videoMatch) {
      const mp4Url = videoMatch[2].replace(/\\u0026/g, "&");
      return {
        url: mp4Url,
        type: "mp4",
        referer: "https://ok.ru/",
        label: "ok.ru HD",
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchAsText(url: string, referer?: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: referer || "https://animexin.dev/",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  return resp.text();
}

export async function resolveEmbed(
  embedUrl: string,
  baseUrl?: string
): Promise<ResolvedStream | null> {
  if (
    embedUrl.includes("dailymotion.com") ||
    embedUrl.includes("dai.ly")
  ) {
    return resolveDailyMotion(embedUrl, baseUrl);
  }
  if (embedUrl.includes("ok.ru")) {
    return resolveOkRu(embedUrl, baseUrl);
  }
  return null;
}
