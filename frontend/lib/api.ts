export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function userIdFromToken(token: string): string | null {
  try {
    const b64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!b64) return null;
    return JSON.parse(atob(b64)).sub || null;
  } catch {
    return null;
  }
}

export interface AnimeSummary {
  id: number | string;
  source: "mal" | "jikan" | "anilist" | "animeschedule";
  title: string;
  title_english: string | null;
  image: string | null;
  banner: string | null;
  score: number | null;
  popularity: number | null;
  episodes: number | null;
  status: string | null;
  genres: string[];
  synopsis: string | null;
  year: number | null;
  season: string | null;
  format: string | null;
  start_date: string | null;
  air_time?: string | null;
}

export interface GogoAnimeItem {
  slug: string;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  poster: string | null;
  score: string | null;
  type: string | null;
  episodes_count: number | null;
  latest_episode: number | null;
  status: string | null;
}

export interface DonghuaItem {
  slug: string;
  title: string;
  poster: string | null;
  episode: number | null;
  sub_type: string;
  type: string;
  url: string;
}

export interface DonghuaDetail {
  slug: string;
  title: string;
  title_alt: string | null;
  poster: string | null;
  score: number | null;
  status: string;
  genres: string[];
  description: string;
  episodes: number | null;
  type: string;
  country: string;
  released: string | null;
  duration: string | null;
  episode_list: { number: number; title: string; url: string; slug: string }[];
  url: string;
}

export interface DonghuaServer {
  label: string;
  stream_url: string;
}

export interface ManhwaItem {
  id: string;
  title: string;
  poster: string | null;
  chapter: number | null;
  rating: number | null;
  status: string;
  genres: string[];
  description: string;
}

export interface ChapterInfo {
  id: string;
  chapter: string;
  title: string;
  volume: string | null;
  pages: number;
  createdAt: string;
}

export interface DonghuaStreamData {
  stream_url: string;
  label: string;
  servers: DonghuaServer[];
  title: string;
}

export interface RecentEpisode {
  title: string;
  episode: number;
  poster: string | null;
  slug: string | null;
  aired_ago: number;
  genres: string[];
  anilist_id: number | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function fetchWithTimeout<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new ApiError(res.status, `Request to ${url} failed: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, revalidateSeconds = 60, retries = 0): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}${path}`, {
        next: { revalidate: revalidateSeconds },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new ApiError(res.status, `Request to ${path} failed: ${res.status}`);
      return res.json();
    } catch (err: any) {
      if (attempt < retries && (err?.name === "AbortError" || err?.code === "ECONNREFUSED")) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Request failed");
}

async function authedRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  retries = 2,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.detail || `Request to ${path} failed: ${res.status}`);
      }
      return res.json();
    } catch (err: any) {
      if (attempt < retries && (err?.name === "AbortError" || err?.code === "ECONNREFUSED")) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Request failed");
}

export interface WatchlistEntryData {
  anime_id: number;
  source: "mal" | "jikan" | "anilist" | "animexin";
  status: "planning" | "watching" | "completed" | "dropped" | "favorites";
  progress: number;
  rating: number | null;
  updated_at: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  image: string | null;
  category: "news" | "industry" | "trailer" | "announcement" | "review";
  published_at: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string | null;
}

export interface EpisodeCommentData {
  id: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  slug: string;
  episode_number: number;
  body: string;
  tag: string;
  parent_id: number | null;
  likes: number;
  replies_count: number;
  is_resolved: boolean;
  liked_by_me: boolean;
  created_at: string;
  replies?: EpisodeCommentData[];
}

export const api = {
  // Anime browsing (now uses MyAnimeList as primary)
  trending: (page = 1) => request<{ data: AnimeSummary[] }>(`/api/v1/anime/trending?page=${page}`, 300),
  topRated: (page = 1) => request<any>(`/api/v1/anime/top-rated?page=${page}`, 3600),
  airing: (page = 1) => request<any>(`/api/v1/anime/airing?page=${page}`, 300),
  upcoming: (page = 1) => request<any>(`/api/v1/anime/upcoming?page=${page}`, 3600),
  detail: (id: number, source: string = "mal") =>
    request<any>(`/api/v1/anime/${id}${source !== "mal" ? `?source=${source}` : ""}`, 3600),
  characters: (id: number) => request<any>(`/api/v1/anime/${id}/characters`, 86400),
  staff: (id: number) => request<any>(`/api/v1/anime/${id}/staff`, 86400),
  episodes: (id: number, page = 1) => request<any>(`/api/v1/anime/${id}/episodes?page=${page}`, 3600),
  recommendations: (id: number) => request<any>(`/api/v1/anime/${id}/recommendations`, 86400),
  
  // Seasonal & Schedule
  currentSeason: (page = 1) => request<any>(`/api/v1/seasonal/current?page=${page}`, 3600),
  season: (year: number, season: string, page = 1) =>
    request<any>(`/api/v1/seasonal/${year}/${season}?page=${page}`, 300),
  weeklySchedule: () => request<any>(`/api/v1/schedule/weekly`, 300),
  daySchedule: (day: string) => request<any>(`/api/v1/schedule/${day}`, 300),
  
  // Search
  search: (q: string, params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams({ q, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    return request<{ data: AnimeSummary[] }>(`/api/v1/search?${qs.toString()}`, 60);
  },
  genres: () => request<any>(`/api/v1/search/genres`, 86400),
  
  // News (AnimeNewsNetwork)
  news: (page = 1, limit = 20) => 
    request<{ data: NewsItem[] }>(`/api/v1/news/?page=${page}&limit=${limit}`, 900),
  newsReviews: (anime_id?: string, page = 1) => 
    request<any>(`/api/v1/news/reviews${anime_id ? `?anime_id=${anime_id}&page=${page}` : `?page=${page}`}`, 900),
  newsFeatured: () => 
    request<any>(`/api/v1/news/featured`, 1800),
  newsRankings: (ranking_type = "top-anime") => 
    request<any>(`/api/v1/news/rankings/${ranking_type}`, 3600),

  // Authentication (local routes — backend on Render is suspended)
  register: (email: string, username: string, password: string) =>
    fetch(`/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.detail || "Registration failed");
      return json as { access_token: string; token_type: string };
    }),

  login: (email: string, password: string) =>
    fetch(`/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.detail || "Login failed");
      return json as { access_token: string; token_type: string };
    }),

  getMe: (token: string) =>
    fetch(`/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, "Auth failed");
      return res.json() as Promise<UserProfile>;
    }),

  // Watchlist (localStorage-backed — works without backend)
  getWatchlist: (token: string) => {
    const uid = userIdFromToken(token);
    const raw = uid ? localStorage.getItem(`wl_${uid}`) : null;
    const entries: WatchlistEntryData[] = raw ? JSON.parse(raw) : [];
    return Promise.resolve({ user_id: uid || "", entries });
  },

  upsertWatchlistEntry: (
    token: string,
    entry: { anime_id: number; source?: string; status: string; progress?: number; rating?: number | null }
  ) => {
    const uid = userIdFromToken(token);
    if (!uid) return Promise.reject(new ApiError(401, "Not authenticated"));
    const raw = localStorage.getItem(`wl_${uid}`);
    const list: WatchlistEntryData[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((e: WatchlistEntryData) => e.anime_id === entry.anime_id);
    const updated: WatchlistEntryData = {
      anime_id: entry.anime_id,
      source: (entry.source || "mal") as WatchlistEntryData["source"],
      status: entry.status as WatchlistEntryData["status"],
      progress: entry.progress ?? (idx >= 0 ? list[idx].progress : 0),
      rating: entry.rating !== undefined ? entry.rating : (idx >= 0 ? list[idx].rating : null),
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = updated;
    else list.push(updated);
    localStorage.setItem(`wl_${uid}`, JSON.stringify(list));
    return Promise.resolve({ user_id: uid, entry: updated });
  },

  removeWatchlistEntry: (token: string, animeId: number) => {
    const uid = userIdFromToken(token);
    if (!uid) return Promise.reject(new ApiError(401, "Not authenticated"));
    const raw = localStorage.getItem(`wl_${uid}`);
    if (raw) {
      const list: WatchlistEntryData[] = JSON.parse(raw);
      localStorage.setItem(`wl_${uid}`, JSON.stringify(list.filter((e: WatchlistEntryData) => e.anime_id !== animeId)));
    }
    return Promise.resolve({ removed: 1 });
  },

  // GogoAnime streaming
  gogoanimeSearch: (q: string) =>
    request<{ data: any[] }>(`/api/v1/streaming/gogoanime/search?q=${encodeURIComponent(q)}`, 300),
  gogoanimeStream: (slug: string, ep: number, audio: string = "sub") =>
    request<{ data: { master_m3u8: string | null; qualities: { quality: string; url: string }[]; embed_url?: string | null; direct_stream?: { stream_url: string; referer: string } | null } | null }>(`/api/v1/streaming/gogoanime/${slug}/stream?ep=${ep}&audio=${audio}`, 60),
  gogoanimeMaster: (slug: string, ep: number, audio: string = "sub") =>
    `${API_BASE}/api/v1/streaming/gogoanime/${slug}/master?ep=${ep}&audio=${audio}`,
  gogoanimeEmbedProxy: (url: string, referer: string = "") => {
    const encoded = btoa(url).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";
    return `${API_BASE}/api/v1/streaming/gogoanime/embed-proxy?url=${encoded}${refParam}`;
  },
  gogoanimeCleanEmbed: (url: string) =>
    `${API_BASE}/api/v1/streaming/gogoanime/embed-page?url=${encodeURIComponent(url)}`,
  gogoanimeLatest: (day?: string) =>
    request<{ data: GogoAnimeItem[]; day?: string }>(
      `/api/v1/streaming/gogoanime/latest${day ? `?day=${day}` : ""}`,
      300
    ),
  gogoanimeHealth: () =>
    request<{ healthy: boolean; reason?: string }>(`/api/v1/streaming/gogoanime/health`, 120),

  // Recent episodes (episode-level data from AniList + GogoAnime catalog)
  recentEpisodes: (page = 1, limit = 20) =>
    request<{ data: RecentEpisode[]; page: number; has_next: boolean }>(
      `/api/v1/streaming/recent?page=${page}&limit=${limit}`,
      300
    ),

  // Anivexa fallback streaming
  anivexaSearch: (q: string) =>
    request<{ data: any[] }>(`/api/v1/streaming/anivexa/search?q=${encodeURIComponent(q)}`, 300),
  anivexaEpisodes: (anilistId: number) =>
    request<any>(`/api/v1/streaming/anivexa/${anilistId}/episodes`, 300),
  anivexaStream: (anilistId: number, ep: number, audio = "sub") =>
    request<{ stream_url: string; subtitles: any[]; provider: string }>(
      `/api/v1/streaming/anivexa/${anilistId}/stream?ep=${ep}&audio=${audio}`, 60
    ),
  anivexaMaster: (anilistId: number, ep: number, audio = "sub") =>
    `${API_BASE}/api/v1/streaming/anivexa/${anilistId}/master?ep=${ep}&audio=${audio}`,
  anivexaSubtitleProxy: (url: string) =>
    `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(btoa(url))}`,

  anivexaResolve: (q: string) =>
    request<{ anilist_id: number | null; title: any }>(`/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(q)}`, 30),

  // Fetch subtitles only (background — used alongside GogoAnime primary stream)
  fetchSubtitles: (q: string, ep: number, anilistId?: number) =>
    request<{ subtitles: any[]; provider: string | null }>(
      `/api/v1/streaming/subtitles?q=${encodeURIComponent(q)}&ep=${ep}${anilistId ? `&anilist_id=${anilistId}` : ""}`,
      60
    ),

  // Anitsu streaming (AnimeXin — 2nd fallback for donghua)
  anitsuStream: (q: string, ep: number) =>
    request<any>(`/api/v1/streaming/anitsu/stream?q=${encodeURIComponent(q)}&ep=${ep}`, 30),

  // Manhwa (MangaDex)
  manhwaTrending: (page = 1) =>
    fetchWithTimeout<{ data: ManhwaItem[]; page: number }>(`/api/v1/manhwa/trending?page=${page}`, 15000),
  manhwaLatest: (page = 1) =>
    fetchWithTimeout<{ data: ManhwaItem[]; page: number }>(`/api/v1/manhwa/latest?page=${page}`, 15000),
  manhwaSearch: (q: string) =>
    fetchWithTimeout<{ data: ManhwaItem[]; query: string }>(`/api/v1/manhwa/search?q=${encodeURIComponent(q)}`, 15000),
  manhwaDetail: (id: string) =>
    fetchWithTimeout<{ data: ManhwaItem }>(`/api/v1/manhwa/manga/${encodeURIComponent(id)}`, 20000),
  manhwaChapters: (id: string) =>
    fetchWithTimeout<{ data: ChapterInfo[] }>(`/api/v1/manhwa/manga/${encodeURIComponent(id)}/chapters`, 15000),
  manhwaChapterPages: (id: string) =>
    fetchWithTimeout<{ data: { baseUrl: string; hash: string; pages: string[] } }>(`/api/v1/manhwa/chapter/${encodeURIComponent(id)}`, 15000),

  // Donghua streaming — proxies through Render backend (Cold start ~30-60s)
  donghuaStream: (q: string, ep: number, audio = "sub", anilistId?: number) => {
    let path = `/api/v1/streaming/donghua/stream?q=${encodeURIComponent(q)}&ep=${ep}&audio=${audio}`;
    if (anilistId) path += `&anilist_id=${anilistId}`;
    return fetchWithTimeout<{ data: DonghuaStreamData }>(`${API_BASE}${path}`, 60000);
  },
  donghuaResolve: (q: string) =>
    request<{ data: any[]; query: string }>(`/api/v1/streaming/donghua/resolve?q=${encodeURIComponent(q)}`, 300),

  // AnimeXin donghua section
  donghuaTrending: () =>
    request<{ data: DonghuaItem[] }>(`/api/v1/donghua/trending`, 300),
  donghuaLatest: (page = 1) =>
    request<{ data: DonghuaItem[]; page: number }>(`/api/v1/donghua/latest?page=${page}`, 300),
  donghuaSearch: (q: string) =>
    request<{ data: DonghuaItem[]; query: string }>(`/api/v1/donghua/search?q=${encodeURIComponent(q)}`, 60),
  donghuaBrowse: (page = 1) =>
    request<{ data: DonghuaItem[]; page: number }>(`/api/v1/donghua/browse?page=${page}`, 300),
  donghuaDetail: (slug: string) =>
    request<{ data: DonghuaDetail }>(`/api/v1/donghua/anime/${encodeURIComponent(slug)}`, 600),
  donghuaStreamUrl: (slug: string, episode: number, server = 0) =>
    `${API_BASE}/api/v1/donghua/stream?slug=${encodeURIComponent(slug)}&episode=${episode}&server=${server}`,
  donghuaServers: (slug: string, episode: number) =>
    request<{ data: { title: string; servers: DonghuaServer[]; prev_url: string | null; next_url: string | null } }>(
      `/api/v1/donghua/anime/${encodeURIComponent(slug)}/episode/${episode}`, 60
    ),
  donghuaProxy: (url: string, referer: string = "") =>
    `${API_BASE}/api/v1/donghua/proxy?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ""}`,

  // Wibu streaming (3rd fallback)
  wibuStream: (q: string, ep: number, server: string = "vidstream") =>
    request<any>(`/api/v1/streaming/wibu/stream?q=${encodeURIComponent(q)}&ep=${ep}&server=${server}`, 30),

  // Fallback (tries GogoAnime, then Anivexa)
  fallbackSearch: (q: string) =>
    request<{ data: any[]; source: string }>(`/api/v1/streaming/fallback/search?q=${encodeURIComponent(q)}`, 300),
  fallbackStream: (q: string, ep: number, audio = "sub", anilistId?: number) => {
    let path = `/api/v1/streaming/fallback/stream?q=${encodeURIComponent(q)}&ep=${ep}&audio=${audio}`;
    if (anilistId) path += `&anilist_id=${anilistId}`;
    return request<any>(path, 60);
  },

  // Push notifications
  getVapidKey: () =>
    request<{ public_key: string }>(`/api/v1/notifications/vapid-key`, 86400),

  subscribePush: (token: string, subscription: { endpoint: string; p256dh: string; auth: string }) =>
    authedRequest<{ status: string }>("/api/v1/notifications/subscribe", token, {
      method: "POST",
      body: JSON.stringify(subscription),
    }),

  unsubscribePush: (token: string, subscription: { endpoint: string; p256dh: string; auth: string }) =>
    authedRequest<{ status: string }>("/api/v1/notifications/unsubscribe", token, {
      method: "POST",
      body: JSON.stringify(subscription),
    }),

  downloadUrl: (params: { slug?: string; anilist_id?: number; ep: number; audio: string; filename: string }) => {
    const q = new URLSearchParams();
    if (params.slug) q.set("slug", params.slug);
    if (params.anilist_id) q.set("anilist_id", String(params.anilist_id));
    q.set("ep", String(params.ep));
    q.set("audio", params.audio);
    q.set("filename", params.filename);
    return `${API_BASE}/api/v1/streaming/download?${q.toString()}`;
  },

  // Episode comments
  getComments: (slug: string, episodeNumber: number, sort: string = "newest") =>
    fetch(`${API_BASE}/api/v1/comments?slug=${encodeURIComponent(slug)}&episode_number=${episodeNumber}&sort=${sort}&_t=${Date.now()}`, {
      cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, `Request to comments failed: ${res.status}`);
      return res.json() as Promise<{ comments: EpisodeCommentData[]; total: number }>;
    }),
  postComment: (token: string, slug: string, episodeNumber: number, body: string, tag: string = "comment", parentId?: number) =>
    authedRequest<EpisodeCommentData>("/api/v1/comments", token, {
      method: "POST",
      body: JSON.stringify({ slug, episode_number: episodeNumber, body, tag, parent_id: parentId ?? null }),
    }),
  likeComment: (token: string, commentId: number) =>
    authedRequest<{ liked: boolean; likes: number }>(`/api/v1/comments/${commentId}/like`, token, {
      method: "POST",
    }),
  resolveComment: (token: string, commentId: number) =>
    authedRequest<{ is_resolved: boolean }>(`/api/v1/comments/${commentId}/resolve`, token, {
      method: "PATCH",
    }),
  deleteComment: (token: string, commentId: number) =>
    authedRequest<{ deleted: boolean }>(`/api/v1/comments/${commentId}`, token, {
      method: "DELETE",
    }),
  getAdminIssues: (token: string, slug?: string, resolved?: boolean) => {
    let path = `/api/v1/admin/issues?`;
    if (slug) path += `slug=${encodeURIComponent(slug)}&`;
    if (resolved !== undefined) path += `resolved=${resolved}&`;
    return authedRequest<{ issues: any[]; total: number }>(path, token);
  },

  // Admin — user management
  adminListUsers: (token: string, q = "", page = 1) =>
    authedRequest<{ users: any[]; total: number }>(`/api/v1/admin/users?q=${encodeURIComponent(q)}&page=${page}`, token),

  adminDeleteUser: (token: string, userId: string) =>
    authedRequest<{ detail: string }>(`/api/v1/admin/users/${userId}`, token, { method: "DELETE" }),

  adminSetAdmin: (token: string, userId: string, isAdmin: boolean) =>
    authedRequest<any>(`/api/v1/admin/users/${userId}/admin`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
};
