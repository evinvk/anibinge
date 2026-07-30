const API = "https://api.mangadex.org";
const CDN = "https://uploads.mangadex.org";

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
  return attrs.title.en || Object.values(attrs.title)[0] || "Untitled";
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
  return { data: (json.data || []).map(parseMangaItem) };
}

export async function getLatest(page = 1): Promise<{ data: ManhwaItemData[] }> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const json = await fetchMangadex(
    `/manga?limit=${limit}&offset=${offset}&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive&originalLanguage[]=ko&includes[]=cover_art`,
    60
  );
  return { data: (json.data || []).map(parseMangaItem) };
}

export async function searchManga(q: string): Promise<{ data: ManhwaItemData[] }> {
  const json = await fetchMangadex(
    `/manga?limit=20&title=${encodeURIComponent(q)}&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive&originalLanguage[]=ko&includes[]=cover_art`,
    30
  );
  return { data: (json.data || []).map(parseMangaItem) };
}

export async function getMangaDetail(id: string): Promise<ManhwaItemData> {
  const json = await fetchMangadex(
    `/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`,
    300
  );
  return parseMangaItem(json.data);
}

export interface ChapterData {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
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
