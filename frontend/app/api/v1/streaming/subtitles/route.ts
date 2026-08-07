import { NextResponse } from "next/server";
import { ANIVEXA_API, ANIVEXA_PROVIDERS, extractEmbedSubtitles } from "@/lib/anivexa";
const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function resolveTitle(q: string): Promise<number | null> {
  try {
    const query = `query($q:String){Page(page:1,perPage:1){media(search:$q,type:ANIME){id}}}`;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { q } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.Page?.media?.[0]?.id || null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const anilistIdParam = url.searchParams.get("anilist_id");
  const audio = url.searchParams.get("audio") || "sub";

  let anilistId = anilistIdParam ? parseInt(anilistIdParam) : null;
  if (!anilistId && q) anilistId = await resolveTitle(q);

  if (!anilistId) return NextResponse.json({ subtitles: [], provider: null });

  try {
    // Try Anivexa providers for subtitles
    for (const provider of ANIVEXA_PROVIDERS) {
      try {
        const resp = await fetch(
          `${ANIVEXA_API}/watch/${provider}/${anilistId}/${audio}/${provider}-${ep}`,
          { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        const subs = (data.subtitles || []).map((s: any) => ({
          file: s.url || s.file,
          label: s.label || s.language || "English",
          language: s.language || "en",
          kind: "captions",
          default: s.default || false,
          source: provider,
          referer: `https://${provider}.app/`,
        }));
        for (const s of data.streams || []) {
          if (s?.type !== "embed") continue;
          for (const sub of extractEmbedSubtitles(s.url, provider)) {
            if (!subs.some((x: any) => x.file === sub.file)) subs.push(sub);
          }
        }
        if (subs.length > 0) return NextResponse.json({ subtitles: subs, provider });
      } catch { continue; }
    }
  } catch {}

  return NextResponse.json({ subtitles: [], provider: null });
}
