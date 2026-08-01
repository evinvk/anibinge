import { fetchViaCfProxy, hasCfProxy } from "@/lib/cf-proxy";
import http from "node:http";
import https from "node:https";

const API = "https://api.comick.dev";
const COVER_CDN = "https://meo.comick.pictures";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" };
export const SEARCH_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" };

const HEADERS = { "User-Agent": UA, "Accept": "application/json", "Referer": "https://comick.dev/" };

const GENRES: Record<number, { name: string; group: string }> = {
  244: { name: "Action", group: "Genre" },
  245: { name: "Adventure", group: "Genre" },
  246: { name: "Award Winning", group: "Format" },
  247: { name: "Comedy", group: "Genre" },
  248: { name: "Cooking", group: "Theme" },
  249: { name: "Doujinshi", group: "Format" },
  250: { name: "Drama", group: "Genre" },
  251: { name: "Ecchi", group: "Content" },
  252: { name: "Fantasy", group: "Genre" },
  253: { name: "Gyaru", group: "Theme" },
  254: { name: "Harem", group: "Theme" },
  255: { name: "Historical", group: "Genre" },
  256: { name: "Horror", group: "Genre" },
  257: { name: "Martial Arts", group: "Theme" },
  258: { name: "Mecha", group: "Genre" },
  259: { name: "Medical", group: "Genre" },
  260: { name: "Music", group: "Theme" },
  261: { name: "Mystery", group: "Genre" },
  262: { name: "Oneshot", group: "Format" },
  263: { name: "Psychological", group: "Genre" },
  264: { name: "Romance", group: "Genre" },
  265: { name: "School Life", group: "Theme" },
  266: { name: "Sci-Fi", group: "Genre" },
  267: { name: "Shoujo Ai", group: "Genre" },
  268: { name: "Shounen Ai", group: "Genre" },
  269: { name: "Slice of Life", group: "Genre" },
  270: { name: "Smut", group: "Content" },
  271: { name: "Sports", group: "Genre" },
  272: { name: "Supernatural", group: "Theme" },
  273: { name: "Tragedy", group: "Genre" },
  274: { name: "Long Strip", group: "Format" },
  275: { name: "Yaoi", group: "Genre" },
  276: { name: "Yuri", group: "Genre" },
  277: { name: "Video Games", group: "Theme" },
  278: { name: "Isekai", group: "Genre" },
  279: { name: "Adaptation", group: "Format" },
  280: { name: "Anthology", group: "Format" },
  281: { name: "Web Comic", group: "Format" },
  282: { name: "Full Color", group: "Format" },
  283: { name: "User Created", group: "Format" },
  284: { name: "Official Colored", group: "Format" },
  285: { name: "Fan Colored", group: "Format" },
  286: { name: "Gore", group: "Content" },
  287: { name: "Sexual Violence", group: "Content" },
  288: { name: "Crime", group: "Genre" },
  289: { name: "Magical Girls", group: "Genre" },
  290: { name: "Philosophical", group: "Genre" },
  291: { name: "Superhero", group: "Genre" },
  292: { name: "Thriller", group: "Genre" },
  293: { name: "Wuxia", group: "Genre" },
  294: { name: "Aliens", group: "Theme" },
  295: { name: "Animals", group: "Theme" },
  296: { name: "Crossdressing", group: "Theme" },
  297: { name: "Demons", group: "Theme" },
  298: { name: "Delinquents", group: "Theme" },
  299: { name: "Genderswap", group: "Theme" },
  300: { name: "Ghosts", group: "Theme" },
  301: { name: "Monster Girls", group: "Theme" },
  302: { name: "Loli", group: "Theme" },
  303: { name: "Magic", group: "Theme" },
  304: { name: "Military", group: "Theme" },
  305: { name: "Monsters", group: "Theme" },
  306: { name: "Ninja", group: "Theme" },
  307: { name: "Office Workers", group: "Theme" },
  308: { name: "Police", group: "Theme" },
  309: { name: "Post-Apocalyptic", group: "Theme" },
  310: { name: "Reincarnation", group: "Theme" },
  311: { name: "Reverse Harem", group: "Theme" },
  312: { name: "Samurai", group: "Theme" },
  313: { name: "Shota", group: "Theme" },
  314: { name: "Survival", group: "Theme" },
  315: { name: "Time Travel", group: "Theme" },
  316: { name: "Vampires", group: "Theme" },
  317: { name: "Traditional Games", group: "Theme" },
  318: { name: "Virtual Reality", group: "Theme" },
  319: { name: "Zombies", group: "Theme" },
  320: { name: "Incest", group: "Theme" },
  321: { name: "Mafia", group: "Theme" },
  322: { name: "Villainess", group: "Theme" },
};

const STATUS: Record<number, string> = {
  1: "ongoing",
  2: "completed",
  3: "cancelled",
  4: "ongoing",
  5: "upcoming",
};

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

export interface ChapterData {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
  externalUrl: string | null;
}

function fetchHttp1(path: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API}${path}`);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        host: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        servername: url.hostname,
        headers: { ...HEADERS, "Accept-Encoding": "identity" },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`ComicK HTTP ${res.statusCode}: ${path}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve(body));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`ComicK timeout: ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

async function fetchComick(path: string, revalidate = 60): Promise<any> {
  try {
    return JSON.parse(await fetchHttp1(path));
  } catch {
    // fall back to undici (may be CF-challenged; callers handle failures)
    const res = await fetch(`${API}${path}`, {
      headers: HEADERS,
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`ComicK ${res.status}: ${path}`);
    return res.json();
  }
}

function coverUrl(b2key?: string | null): string | null {
  return b2key ? `${COVER_CDN}/${b2key}` : null;
}

function genreNames(ids: any[]): string[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => GENRES[Number(id)])
    .filter((g): g is { name: string; group: string } => !!g && (g.group === "Genre" || g.group === "Theme"))
    .map((g) => g.name);
}

function safeRating(rating: any): number | null {
  if (rating === null || rating === undefined || rating === "") return null;
  const n = parseFloat(String(rating));
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

function safeChapter(lastChapter: any): number | null {
  if (lastChapter === null || lastChapter === undefined || lastChapter === "") return null;
  const n = parseFloat(String(lastChapter));
  return isNaN(n) ? null : n;
}

export function parseItem(raw: any): ManhwaItemData {
  return {
    id: raw.hid,
    title: raw.title || "Untitled",
    poster: coverUrl(raw.md_covers?.[0]?.b2key),
    chapter: safeChapter(raw.last_chapter),
    rating: safeRating(raw.bayesian_rating ?? raw.rating),
    status: STATUS[raw.status] || "unknown",
    genres: genreNames(raw.genres),
    description: raw.desc || "",
  };
}

export async function getTrending(page = 1): Promise<{ data: ManhwaItemData[] }> {
  const json = await fetchComick(
    `/v1.0/search?sort=view&limit=20&page=${page}&lang=en&country=kr`,
    120
  );
  const items = (Array.isArray(json) ? json : [])
    .filter((i: any) => i?.content_rating !== "erotica" && i?.content_rating !== "pornographic")
    .map(parseItem);
  return { data: items };
}

export async function getLatest(page = 1): Promise<{ data: ManhwaItemData[] }> {
  const json = await fetchComick(
    `/v1.0/search?sort=uploaded&limit=20&page=${page}&lang=en&country=kr`,
    60
  );
  const items = (Array.isArray(json) ? json : [])
    .filter((i: any) => i?.content_rating !== "erotica" && i?.content_rating !== "pornographic")
    .map(parseItem);
  return { data: items };
}

export async function searchManga(q: string): Promise<{ data: ManhwaItemData[] }> {
  const json = await fetchComick(
    `/v1.0/search?q=${encodeURIComponent(q)}&limit=20&lang=en&country=kr`,
    30
  );
  const items = (Array.isArray(json) ? json : [])
    .filter((i: any) => i?.content_rating !== "erotica" && i?.content_rating !== "pornographic")
    .map(parseItem);
  return { data: items };
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveHidByTitle(title: string): Promise<string | null> {
  const q = normalizeTitle(title);
  if (q.length < 4) return null;
  try {
    const json = await fetchComick(
      `/v1.0/search?q=${encodeURIComponent(title)}&limit=10&lang=en&country=kr`,
      3600
    );
    const list = Array.isArray(json) ? json : [];
    let inclusive: string | null = null;
    for (const item of list) {
      const candidates = [
        item?.title,
        ...(Array.isArray(item?.md_titles)
          ? item.md_titles.filter((t: any) => t?.lang === "en").map((t: any) => t?.title)
          : []),
      ].filter((c: any): c is string => typeof c === "string" && c.length > 0);
      const norm = candidates.map(normalizeTitle).filter((c) => c.length > 0);
      if (norm.some((c) => c === q)) return item.hid;
      if (!inclusive && norm.some((c) => c.includes(q))) inclusive = item.hid;
    }
    return inclusive;
  } catch {
    return null;
  }
}

export async function getComicCoverByTitle(title: string): Promise<string | null> {
  const q = normalizeTitle(title);
  if (q.length < 4) return null;
  try {
    const json = await fetchComick(
      `/v1.0/search?q=${encodeURIComponent(title)}&limit=5&lang=en`,
      3600
    );
    const list = Array.isArray(json) ? json : [];
    for (const item of list) {
      const candidates = [
        item?.title,
        ...(Array.isArray(item?.md_titles)
          ? item.md_titles.filter((t: any) => t?.lang === "en").map((t: any) => t?.title)
          : []),
      ].filter((c: any): c is string => typeof c === "string" && c.length > 0);
      if (!candidates.some((c) => normalizeTitle(c).includes(q))) continue;
      const b2key = item?.md_covers?.[0]?.b2key;
      if (!b2key) return null;
      const url = `${COVER_CDN}/${b2key}`;
      const res = await fetch(url, { method: "HEAD", next: { revalidate: 86400 } });
      if (!res.ok) return null;
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

async function getComicDetailRaw(hid: string, revalidate = 300): Promise<any> {
  const json = await fetchComick(`/v1.0/comic/${encodeURIComponent(hid)}`, revalidate);
  return json?.comic;
}

export async function getMangaDetail(hid: string): Promise<ManhwaItemData> {
  const raw = await getComicDetailRaw(hid);
  return {
    id: raw.hid,
    title: raw.title || "Untitled",
    poster: coverUrl(raw.md_covers?.[0]?.b2key),
    chapter: safeChapter(raw.last_chapter),
    rating: safeRating(raw.bayesian_rating ?? raw.rating),
    status: STATUS[raw.status] || "unknown",
    genres: Array.isArray(raw.md_comic_md_genres)
      ? raw.md_comic_md_genres
          .map((g: any) => g?.md_genres)
          .filter((g: any) => g && (g.group === "Genre" || g.group === "Theme"))
          .map((g: any) => g.name)
      : [],
    description: raw.desc || "",
  };
}

export async function getChapters(mangaId: string): Promise<{ data: ChapterData[] }> {
  const [first, slug] = await Promise.all([
    fetchComick(`/v1.0/comic/${encodeURIComponent(mangaId)}/chapters?lang=en&limit=100&page=1`, 120).catch(
      () => null
    ),
    getComicDetailRaw(mangaId)
      .then((c) => c?.slug)
      .catch(() => null),
  ]);
  let rows: any[] = first?.chapters || [];
  const total = first?.total || 0;
  if (total > rows.length) {
    const pagesNeeded = Math.min(Math.ceil(total / 100), 5);
    const rest = await Promise.all(
      Array.from({ length: pagesNeeded - 1 }, (_, i) =>
        fetchComick(`/v1.0/comic/${encodeURIComponent(mangaId)}/chapters?lang=en&limit=100&page=${i + 2}`, 120).catch(
          () => null
        )
      )
    );
    rest.forEach((r) => {
      if (r?.chapters?.length) rows = rows.concat(r.chapters);
    });
  }
  const chapters: ChapterData[] = rows
    .filter((ch: any) => ch?.lang === "en" || !ch?.lang)
    .map((ch: any) => ({
      id: ch.hid,
      chapter: ch.chap ?? "",
      title: ch.title || "",
      volume: ch.vol != null ? String(ch.vol) : null,
      pages: 0,
      createdAt: ch.created_at || "",
      externalUrl:
        slug && ch.hid
          ? `https://comick.dev/comic/${slug}/${ch.hid}-chapter-${ch.chap ?? ""}-${ch.lang || "en"}`
          : null,
    }));
  return { data: chapters };
}

export async function getChapterPages(chapterId: string): Promise<{
  baseUrl: string;
  hash: string;
  pages: string[];
}> {
  try {
    const json = await fetchComick(`/chapter/${encodeURIComponent(chapterId)}/get_images`, 0);
    const pages = (Array.isArray(json) ? json : [])
      .filter((u: any): u is string => typeof u === "string" && u.length > 0)
      .map((u: string) => (u.startsWith("//") ? `https:${u}` : u));
    if (pages.length > 0) return { baseUrl: "", hash: "", pages };
  } catch {
    // fall through to CF Worker attempt
  }
  if (hasCfProxy()) {
    try {
      const text = await fetchViaCfProxy(
        `${API}/chapter/${encodeURIComponent(chapterId)}/get_images`
      );
      const parsed = JSON.parse(text);
      const pages = (Array.isArray(parsed) ? parsed : [])
        .filter((u: any): u is string => typeof u === "string" && u.length > 0)
        .map((u: string) => (u.startsWith("//") ? `https:${u}` : u));
      console.log(`ComicK CF proxy pages for ${chapterId}: ${pages.length}`);
      if (pages.length > 0) return { baseUrl: "", hash: "", pages };
    } catch (e: any) {
      console.error(`ComicK CF proxy failed for ${chapterId}:`, e?.message || e);
    }
  }
  return { baseUrl: "", hash: "", pages: [] };
}
