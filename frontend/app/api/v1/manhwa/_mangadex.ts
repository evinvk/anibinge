import { getComicCoverByTitle } from "./_comick";

const API = "https://api.mangadex.org";
const CDN = "https://uploads.mangadex.org";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" };
export const SEARCH_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" };

function coverUrl(mangaId: string, fileName: string): string {
  return fileName ? `${CDN}/covers/${mangaId}/${fileName}.256.jpg` : "";
}

export async function fetchMangadex(path: string, revalidate = 60) {
  const res = await fetch(`${API}${path}`, {
    headers: { "User-Agent": "Anibinge/1.0" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`MangaDex ${res.status}: ${path}`);
  return res.json();
}

export interface ManhwaItemData {
  id: string;
  title: string;
  poster: string | null;
  chapter: number | null;
  rating: number | null;
  status: string;
  genres: string[];
  description: string;
}

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description: Record<string, string>;
    status: string;
    contentRating: string;
    lastChapter: string | null;
    year: number | null;
    tags: { id: string; attributes: { name: Record<string, string>; group: string } }[];
  };
  relationships: { type: string; id: string; attributes?: any }[];
}

function pickTitle(attrs: MdManga["attributes"]): string {
  if (attrs.title.en) return attrs.title.en;
  const enAlt = attrs.altTitles?.find((t) => t.en);
  if (enAlt?.en) return enAlt.en;
  return (
    attrs.title["ko-ro"] ||
    attrs.title["ja-ro"] ||
    attrs.title["zh-ro"] ||
    attrs.title["ko"] ||
    attrs.title["ja"] ||
    attrs.title["zh"] ||
    Object.values(attrs.title)[0] ||
    "Untitled"
  );
}

function pickDescription(attrs: MdManga["attributes"]): string {
  return attrs.description.en || Object.values(attrs.description)[0] || "";
}

function extractGenres(tags: MdManga["attributes"]["tags"]): string[] {
  return tags.filter((t) => t.attributes.group === "genre").map((t) => t.attributes.name.en || "").filter(Boolean);
}

function extractCover(manga: MdManga): string | null {
  const rel = manga.relationships?.find((r) => r.type === "cover_art");
  const fn = rel?.attributes?.fileName;
  return fn ? coverUrl(manga.id, fn) : null;
}

async function fetchAniListBatch(titles: string[]): Promise<(string | null)[]> {
  if (titles.length === 0) return [];
  const vars = Object.fromEntries(titles.map((t, i) => [`t${i}`, t]));
  const query = `query(${titles.map((_, i) => `$t${i}: String`).join(",")}) {
    ${titles.map((_, i) => `m${i}: Media(search: $t${i}, type: MANGA) { coverImage { extraLarge large } }`).join("\n")}
  }`;
  const resp = await fetch(ANILIST_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query, variables: vars }),
    next: { revalidate: 86400 },
  });
  if (!resp.ok) throw new Error(`AniList ${resp.status}`);
  const json = await resp.json();
  if (json?.errors) throw new Error("AniList query errors");
  const data = json?.data || {};
  return titles.map((_, i) => data[`m${i}`]?.coverImage?.extraLarge || data[`m${i}`]?.coverImage?.large || null);
}

async function fetchAniListCovers(titles: string[]): Promise<(string | null)[]> {
  if (titles.length === 0) return [];
  try {
    return await fetchAniListBatch(titles);
  } catch (e: any) {
    const status = e?.message?.includes("AniList 404");
    if (titles.length === 1 || !status) {
      return titles.map(() => null);
    }
    const mid = Math.ceil(titles.length / 2);
    const [left, right] = await Promise.all([
      fetchAniListCovers(titles.slice(0, mid)),
      fetchAniListCovers(titles.slice(mid)),
    ]);
    return [...left, ...right];
  }
}

async function enrichPosters(items: ManhwaItemData[]): Promise<ManhwaItemData[]> {
  if (items.length === 0) return items;
  try {
    const results: (string | null)[] = new Array(items.length).fill(null);
    const CHUNK = 10;
    await Promise.all(
      Array.from({ length: Math.ceil(items.length / CHUNK) }, async (_, c) => {
        const start = c * CHUNK;
        const chunk = items.slice(start, start + CHUNK);
        const covers = await fetchAniListCovers(chunk.map((i) => i.title));
        covers.forEach((cover, k) => { if (cover) results[start + k] = cover; });
      })
    );
    await Promise.all(
      items.map(async (item, i) => {
        if (results[i]) return;
        const cover = await getComicCoverByTitle(item.title);
        if (cover) results[i] = cover;
      })
    );
    return items.map((item, i) => (results[i] ? { ...item, poster: results[i] } : item));
  } catch (e: any) {
    console.error("Poster enrichment failed:", e?.message || e);
    return items;
  }
}

export function parseMangaItem(manga: MdManga): ManhwaItemData {
  const attrs = manga.attributes;
  return {
    id: manga.id,
    title: pickTitle(attrs),
    poster: extractCover(manga),
    chapter: attrs.lastChapter ? parseFloat(attrs.lastChapter) : null,
    rating: null,
    status: attrs.status || "unknown",
    genres: extractGenres(attrs.tags || []),
    description: pickDescription(attrs),
  };
}

export async function getTrending(page = 1): Promise<{ data: ManhwaItemData[] }> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const json = await fetchMangadex(
    `/manga?limit=${limit}&offset=${offset}&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&originalLanguage[]=ko&includes[]=cover_art`,
    120
  );
  return { data: await enrichPosters((json.data || []).map(parseMangaItem)) };
}

export async function getLatest(page = 1): Promise<{ data: ManhwaItemData[] }> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const json = await fetchMangadex(
    `/manga?limit=${limit}&offset=${offset}&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive&originalLanguage[]=ko&includes[]=cover_art`,
    60
  );
  return { data: await enrichPosters((json.data || []).map(parseMangaItem)) };
}

export async function searchManga(q: string): Promise<{ data: ManhwaItemData[] }> {
  const json = await fetchMangadex(
    `/manga?limit=20&title=${encodeURIComponent(q)}&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive&originalLanguage[]=ko&includes[]=cover_art`,
    30
  );
  return { data: await enrichPosters((json.data || []).map(parseMangaItem)) };
}

export async function getMangaDetail(id: string): Promise<ManhwaItemData> {
  const json = await fetchMangadex(
    `/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`,
    300
  );
  const [item] = await enrichPosters([parseMangaItem(json.data)]);
  return item;
}

export interface ChapterData {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
  externalUrl: string | null;
}

export async function getChapters(mangaId: string): Promise<{ data: ChapterData[] }> {
  const json = await fetchMangadex(
    `/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc&includes[]=scanlation_group`,
    120
  );
  const chapters: ChapterData[] = (json.data || []).map((ch: any) => ({
    id: ch.id,
    chapter: ch.attributes.chapter || "0",
    title: ch.attributes.title || "",
    volume: ch.attributes.volume || null,
    pages: ch.attributes.pages || 0,
    createdAt: ch.attributes.publishAt || "",
    externalUrl: ch.attributes.externalUrl || null,
  }));
  return { data: chapters };
}

export async function getChapterPages(chapterId: string): Promise<{
  baseUrl: string;
  hash: string;
  pages: string[];
}> {
  const json = await fetchMangadex(`/at-home/server/${chapterId}`, 300);
  const { baseUrl, chapter } = json;
  return {
    baseUrl,
    hash: chapter.hash,
    pages: chapter.data.map((p: string) => `${baseUrl}/data/${chapter.hash}/${p}`),
  };
}

export async function getMangaRating(mangaId: string): Promise<number | null> {
  try {
    const json = await fetchMangadex(`/statistics/manga/${mangaId}`, 300);
    const stats = json?.statistics?.[mangaId];
    if (stats?.rating) {
      const avg = stats.rating.bayesian || stats.rating.average;
      return avg ? Math.round(avg * 10) / 10 : null;
    }
  } catch {}
  return null;
}
