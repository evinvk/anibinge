import { NextResponse } from "next/server";
import { fetchGogoApi } from "../gogoanime/_gogoanime";
import { cachedFetch } from "@/lib/ttl-cache";

const GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PAGE_SIZE = 30;
const LIVE_SEARCH_CONCURRENCY = 8;
const ENRICH_DEADLINE_MS = 4000;

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit") || String(PAGE_SIZE))));

  try {
    const payload = await cachedFetch(
      `recent:v4:${page}:${limit}`,
      120000,
      () => buildRecent(page, limit),
      60000
    );
    return NextResponse.json({ ...payload, _version: "v3-releasing-only" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ data: [], page, has_next: false, _version: "v3-error" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}

async function buildRecent(page: number, limit: number) {
  const deadline = Date.now() + 12000;

  // PRIMARY: AniList airing schedule — only genuinely new episodes
  try {
    return await raceTimeout(buildFromAniListSchedule(page, limit), deadline);
  } catch {
    return { data: [], page, has_next: false };
  }
}

async function buildFromAniListSchedule(page: number, limit: number) {
  const deadline = Date.now() + 12000;
  let airing: any[] = [];
  try {
    airing = await raceTimeout(fetchAiringSchedule(page), deadline);
  } catch {}

  if (airing.length === 0) {
    return { data: [], page, has_next: false };
  }

  const start = (page - 1) * limit;
  const target = airing.slice(start, start + limit);

  let slugByTitle = new Map<string, string>();
  try {
    slugByTitle = await raceTimeout(fetchGogoSlugMap(target.map((s: any) => s.title)), deadline);
  } catch {}

  const items = target.map((s: any) => ({
    title: s.title,
    episode: s.episode,
    poster: s.poster,
    slug: slugByTitle.get(normalizeTitle(s.title)) || null,
    aired_ago: s.aired_ago,
    genres: s.genres,
    anilist_id: s.anilist_id,
  }));

  return {
    data: items,
    page,
    has_next: airing.length > start + limit,
  };
}

async function fetchGogoSlugMap(titles: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Cheap bulk pass: popular catalog (covers many ongoing/older shows)
  try {
    const data = await fetchGogoApi("/api/search?keyword=&page=1", 10000);
    const items = Array.isArray(data) ? data : data.items || [];
    for (const it of items) {
      if (!it?.slug) continue;
      for (const t of [it.title_english, it.title, it.title_japanese]) {
        if (t) map.set(normalizeTitle(t), it.slug);
      }
    }
  } catch {}

  // Precision pass: live search for unmatched titles (parallel, deadline-bounded)
  const missing = titles.filter((t) => t && !map.has(normalizeTitle(t)));
  if (missing.length === 0) return map;

  const deadline = Date.now() + ENRICH_DEADLINE_MS;
  for (let i = 0; i < missing.length; i += LIVE_SEARCH_CONCURRENCY) {
    if (Date.now() > deadline) break;
    const chunk = missing.slice(i, i + LIVE_SEARCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (title) => {
        const slug = await liveSearchSlug(title);
        if (slug) map.set(normalizeTitle(title), slug);
      })
    );
  }

  return map;
}

async function liveSearchSlug(title: string): Promise<string | null> {
  try {
    const data = await fetchGogoApi(`/api/search/live?q=${encodeURIComponent(title)}`, 8000);
    const items = Array.isArray(data) ? data : data.data || [];
    const norm = normalizeTitle(title);
    for (const x of items) {
      if (!x?.slug) continue;
      const candidates = [
        x.title,
        x.title_english,
        x.title_japanese,
        String(x.slug).replace(/-/g, " "),
      ].filter(Boolean).map(normalizeTitle);
      if (candidates.some((c) => similarity(norm, c) >= 0.4)) {
        return x.slug;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

async function raceTimeout<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("deadline exceeded");
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("deadline exceeded")), remaining)),
  ]);
}

async function fetchAiringSchedule(page: number): Promise<any[]> {
  try {
    // Get currently airing anime, sorted by most recently updated
    const query = `
      query($page:Int){
        Page(page:$page,perPage:50){
          media(status:RELEASING,type:ANIME,sort:UPDATED_AT_DESC,isAdult:false){
            id
            title{english romaji}
            coverImage{large}
            genres
            nextAiringEpisode{episode airingAt}
            airingSchedule(notYetAired:false,sort:TIME_DESC,perPage:1){
              episode
              airingAt
            }
          }
        }
      }
    `;
    const resp = await fetch(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables: { page } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const media = data?.data?.Page?.media || [];
    const now = Math.floor(Date.now() / 1000);
    const THREE_DAYS = 3 * 24 * 60 * 60;

    return media
      .filter((m: any) => {
        // Must have a recent last aired episode (within 3 days)
        const lastAired = m.airingSchedule?.[0]?.airingAt;
        if (!lastAired) return false;
        return (now - lastAired) < THREE_DAYS;
      })
      .map((m: any) => {
        const lastAired = m.airingSchedule[0];
        return {
          title: m.title?.english || m.title?.romaji || "",
          episode: lastAired.episode,
          aired_ago: now - lastAired.airingAt,
          poster: m.coverImage?.large || null,
          genres: m.genres || [],
          anilist_id: m.id,
        };
      });
  } catch {
    return [];
  }
}