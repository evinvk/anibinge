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
      `recent:${page}:${limit}`,
      120000,
      () => buildRecent(page, limit),
      60000
    );
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ data: [], page, has_next: false });
  }
}

async function buildRecent(page: number, limit: number) {
  const deadline = Date.now() + 12000;

  // PRIMARY: GogoAnime /api/home → latest_episodes (real uploads with real slugs)
  try {
    const homeData = await raceTimeout(fetchGogoApi("/api/home"), deadline);
    const latest = homeData?.latest_episodes || [];

    if (latest.length > 0) {
      // Enrich with AniList metadata (batch query)
      const titles = latest
        .map((e: any) => e.title)
        .filter((t: string) => t && t.length > 0);

      const anilistMap = await raceTimeout(fetchAniListMetadata(titles), deadline);

      const start = (page - 1) * limit;
      const pageItems = latest.slice(start, start + limit);

      const items = pageItems.map((e: any) => {
        const normTitle = normalizeTitle(e.title);
        const enriched = anilistMap.get(normTitle) || {};
        return {
          title: e.title,
          episode: e.episode,
          poster: e.image,
          slug: e.id, // REAL slug from GogoAnime
          aired_ago: 0, // Unknown upload time, but sorted by real upload order
          genres: enriched.genres || [],
          anilist_id: enriched.anilist_id || null,
        };
      });

      return {
        data: items,
        page,
        has_next: latest.length > start + limit,
      };
    }
  } catch (e) {
    console.warn("GogoAnime /api/home failed, falling back to AniList:", e);
  }

  // FALLBACK: AniList airing schedule (current logic - Japanese broadcast times)
  return raceTimeout(buildFromAniListSchedule(page, limit), deadline);
}

async function buildFromAniListSchedule(page: number, limit: number) {
  const deadline = Date.now() + 12000;
  let airing: any[] = [];
  try {
    airing = await raceTimeout(fetchAiringSchedule(page), deadline);
  } catch {}

  if (airing.length === 0) {
    return raceTimeout(buildFromCatalog(page, limit), deadline);
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

async function buildFromCatalog(page: number, limit: number) {
  const data = await fetchGogoApi(`/api/search?keyword=&page=${page}`, 30000);
  const items = Array.isArray(data) ? data : data.items || [];
  const mapped = items
    .map((e: any) => ({
      title: e.title_english || e.title || "",
      episode: e.latest_episode || 0,
      poster: e.poster || null,
      slug: e.slug || "",
      aired_ago: 0,
      genres: [],
      anilist_id: null,
    }))
    .filter((e: any) => e.slug && e.episode > 0);
  if (mapped.length === 0) throw new Error("empty catalog");
  return {
    data: mapped,
    page,
    has_next: items.length >= 30,
  };
}

async function fetchAniListMetadata(titles: string[]): Promise<Map<string, { genres: string[]; anilist_id: number }>> {
  const map = new Map<string, { genres: string[]; anilist_id: number }>();
  if (titles.length === 0) return map;

  // Batch query: search for all titles in chunks
  const CHUNK_SIZE = 10;
  for (let i = 0; i < titles.length; i += CHUNK_SIZE) {
    const chunk = titles.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (title) => {
        try {
          const query = `
            query($search: String) {
              Page(page: 1, perPage: 1) {
                media(search: $search, type: ANIME) {
                  id
                  genres
                  title { romaji english native }
                }
              }
            }
          `;
          const resp = await fetch(GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": UA },
            body: JSON.stringify({ query, variables: { search: title } }),
            signal: AbortSignal.timeout(5000),
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const media = data?.data?.Page?.media?.[0];
          if (media) {
            const normTitle = normalizeTitle(media.title?.english || media.title?.romaji || "");
            map.set(normTitle, {
              genres: media.genres || [],
              anilist_id: media.id,
            });
            // Also index by original search title for better matching
            map.set(normalizeTitle(title), {
              genres: media.genres || [],
              anilist_id: media.id,
            });
          }
        } catch {}
      })
    );
  }
  return map;
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
    const query = `
      query($page:Int){
        Page(page:$page,perPage:50){
          airingSchedules(notYetAired:false,sort:TIME_DESC){
            episode
            airingAt
              media{
              id
              isAdult
              title{english romaji}
              coverImage{large}
              genres
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
    const schedules = data?.data?.Page?.airingSchedules || [];
    const now = Math.floor(Date.now() / 1000);

    return schedules
      .filter((s: any) => s.media && !s.media.isAdult)
      .map((s: any) => {
        const m = s.media;
        return {
          title: m.title?.english || m.title?.romaji || "",
          episode: s.episode,
          aired_ago: now - s.airingAt,
          poster: m.coverImage?.large || null,
          genres: m.genres || [],
          anilist_id: m.id,
        };
      });
  } catch {
    return [];
  }
}