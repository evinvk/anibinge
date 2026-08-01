export const ANIVEXA_API = "https://anivexa-api-eight.vercel.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export const ANIVEXA_PROVIDERS = [
  "anidbapp",
  "anikoto",
  "animegg",
  "anineko",
  "2dhive",
  "anibd",
  "anizone",
  "reanime",
  "animenosub",
  "senshi",
  "kaa",
];

export interface AnivexaStream {
  source: "anivexa";
  provider: string;
  stream_url: string;
  stream_type: "hls" | "mp4";
  referer: string;
  embed_url: string | null;
  subtitles: any[];
}

const AD_URL_RE = /(ibyteimg|byteimg|tiktokcdn|doubleclick|lgappstv|ad-site)/i;

function isAdUrl(u: string): boolean {
  return AD_URL_RE.test(u);
}

function isMp4Url(u: string): boolean {
  try {
    return /\.(mp4|mkv|webm|mov)$/i.test(new URL(u).pathname);
  } catch {
    return false;
  }
}

async function fetchWithReferer(
  url: string,
  referer: string,
  timeoutMs = 8000
): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
}

function hasRealSegments(playlist: string): boolean {
  const lines = playlist.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF")) continue;
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (next && !next.startsWith("#") && !isAdUrl(next)) return true;
  }
  return false;
}

async function playlistHasRealSegments(streamUrl: string, referer: string): Promise<boolean> {
  const resp = await fetchWithReferer(streamUrl, referer);
  if (!resp || !resp.ok) return false;
  const text = (await resp.text()).slice(0, 300000);
  if (!text.trim().startsWith("#EXTM3U")) return false;

  if (!text.includes("#EXT-X-STREAM-INF")) {
    return hasRealSegments(text);
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("#EXT-X-STREAM-INF")) continue;
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    if (!next || next.startsWith("#")) continue;
    const variantUrl = next.startsWith("http") ? next : new URL(next, streamUrl).href;
    if (isAdUrl(variantUrl)) continue;
    const variantResp = await fetchWithReferer(variantUrl, referer);
    if (!variantResp || !variantResp.ok) continue;
    const variantText = (await variantResp.text()).slice(0, 300000);
    if (variantText.trim().startsWith("#EXTM3U") && hasRealSegments(variantText)) {
      return true;
    }
  }
  return false;
}

export async function getAnivexaStream(
  anilistId: number,
  ep: number,
  audio = "sub"
): Promise<AnivexaStream | null> {
  const deadline = Date.now() + 22000;
  for (const provider of ANIVEXA_PROVIDERS) {
    if (Date.now() > deadline) break;
    try {
      const resp = await fetch(
        `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${provider}-${ep}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!Array.isArray(data?.streams)) continue;

      const streams = data.streams;
      const hlsStream = streams.find((s: any) => s.type === "hls");
      const embedStream = streams.find((s: any) => s.type === "embed");
      const streamUrl = hlsStream?.url || streams[0]?.url || null;
      if (!streamUrl) continue;

      const referer = `https://${provider}.app/`;

      // Skip providers that answer with a broken or ad-only playlist
      // (e.g. anineko returns an all-ad HLS for episodes it does not actually have).
      if (!isMp4Url(streamUrl)) {
        const valid = await playlistHasRealSegments(streamUrl, referer);
        if (!valid) continue;
      }

      const subtitles = (data.subtitles || []).map((s: any) => ({
        file: s.url || s.file,
        label: s.label || s.language || "English",
        language: s.language || "en",
        kind: "captions",
        source: provider,
        referer,
      }));

      return {
        source: "anivexa",
        provider,
        stream_url: streamUrl,
        stream_type: isMp4Url(streamUrl) ? "mp4" : "hls",
        referer,
        embed_url: embedStream?.url || data.embed_url || null,
        subtitles,
      };
    } catch {
      continue;
    }
  }
  return null;
}
