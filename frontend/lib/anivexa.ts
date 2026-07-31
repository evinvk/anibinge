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

export async function getAnivexaStream(
  anilistId: number,
  ep: number,
  audio = "sub"
): Promise<AnivexaStream | null> {
  for (const provider of ANIVEXA_PROVIDERS) {
    try {
      const resp = await fetch(
        `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${provider}-${ep}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!Array.isArray(data?.streams)) continue;

      const streams = data.streams;
      const hlsStream = streams.find((s: any) => s.type === "hls");
      const embedStream = streams.find((s: any) => s.type === "embed");
      const streamUrl = hlsStream?.url || streams[0]?.url || null;
      if (!streamUrl) continue;

      const subtitles = (data.subtitles || []).map((s: any) => ({
        file: s.url || s.file,
        label: s.label || s.language || "English",
        language: s.language || "en",
        kind: "captions",
        source: provider,
        referer: `https://${provider}.app/`,
      }));

      const isMp4 = (u: string) => /\.(mp4|mkv|webm|mov)$/i.test(new URL(u).pathname);

      return {
        source: "anivexa",
        provider,
        stream_url: streamUrl,
        stream_type: isMp4(streamUrl) ? "mp4" : "hls",
        referer: `https://${provider}.app/`,
        embed_url: embedStream?.url || data.embed_url || null,
        subtitles,
      };
    } catch {
      continue;
    }
  }
  return null;
}
