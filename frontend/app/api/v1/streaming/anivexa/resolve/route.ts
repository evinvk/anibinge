import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GRAPHQL = "https://graphql.anilist.co";

const SEARCH_QUERY = `query($q:String){Page(page:1,perPage:10){media(search:$q,type:ANIME){id idMal title{english romaji native} episodes format}}}`;

// Suffixes appended to titles by mirror sites (e.g. "…New", "(Dub)") that break
// exact AniList search. Each is stripped progressively until a query matches.
const SUFFIX_STRIPS: RegExp[] = [
  /\s+\(?(?:new|reboot|remaster|remake|special|ova|ona)\)?\s*$/i,
  /\s+\b(?:dub|dubbed|sub|subbed|english\s+dub)\b\s*$/i,
  /\s+\(?\d{4}\)?\s*$/i,
];

function candidateQueries(q: string): string[] {
  const out = [q];
  let cur = q.trim();
  for (const re of SUFFIX_STRIPS) {
    const next = cur.replace(re, " ").replace(/\s+/g, " ").trim();
    if (next && next !== cur && !out.includes(next)) {
      out.push(next);
      cur = next;
    }
  }
  const noParen = cur.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (noParen && noParen !== cur && !out.includes(noParen)) out.push(noParen);
  return out;
}

async function searchAniList(q: string): Promise<any | null> {
  try {
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const media = data?.data?.Page?.media;
    if (!media?.length) return null;
    return media[0];
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q) return NextResponse.json({ anilist_id: null, title: null });

  for (const candidate of candidateQueries(q)) {
    const m = await searchAniList(candidate);
    if (!m) continue;
    return NextResponse.json({
      anilist_id: m.id,
      mal_id: m.idMal,
      title: m.title?.english || m.title?.romaji || m.title?.native || "",
      episodes: m.episodes,
    });
  }

  return NextResponse.json({ anilist_id: null, title: null });
}
