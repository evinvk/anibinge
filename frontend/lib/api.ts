const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AnimeSummary {
  id: number;
  source: "mal" | "jikan" | "anilist";
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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, revalidateSeconds = 60): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) throw new ApiError(res.status, `Request to ${path} failed: ${res.status}`);
  return res.json();
}

async function authedRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || `Request to ${path} failed: ${res.status}`);
  }
  return res.json();
}

export interface WatchlistEntryData {
  anime_id: number;
  source: "mal" | "jikan" | "anilist";
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
    request<any>(`/api/v1/seasonal/${year}/${season}?page=${page}`, 3600),
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

  // Authentication
  register: (email: string, username: string, password: string) =>
    fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.detail || "Registration failed");
      return json as { access_token: string; token_type: string };
    }),

  login: (email: string, password: string) =>
    fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json.detail || "Login failed");
      return json as { access_token: string; token_type: string };
    }),

  getMe: (token: string) =>
    authedRequest<UserProfile>("/api/v1/auth/me", token),

  // Watchlist
  getWatchlist: (token: string) =>
    authedRequest<{ user_id: string; entries: WatchlistEntryData[] }>("/api/v1/watchlist", token),

  upsertWatchlistEntry: (
    token: string,
    entry: { anime_id: number; source?: string; status: string; progress?: number; rating?: number | null }
  ) =>
    authedRequest<{ user_id: string; entry: WatchlistEntryData }>("/api/v1/watchlist", token, {
      method: "PUT",
      body: JSON.stringify(entry),
    }),

  removeWatchlistEntry: (token: string, animeId: number) =>
    authedRequest<{ removed: number }>(`/api/v1/watchlist/${animeId}`, token, {
      method: "DELETE",
    }),

  // GogoAnime streaming
  gogoanimeSearch: (q: string) =>
    request<{ data: any[] }>(`/api/v1/streaming/gogoanime/search?q=${encodeURIComponent(q)}`, 300),
  gogoanimeStream: (slug: string, ep: number) =>
    request<{ data: { master_m3u8: string; qualities: { quality: string; url: string }[] } | null }>(`/api/v1/streaming/gogoanime/${slug}/stream?ep=${ep}`, 60),
  gogoanimeMaster: (slug: string, ep: number) =>
    `${API_BASE}/api/v1/streaming/gogoanime/${slug}/master?ep=${ep}`,
  gogoanimeLatest: () =>
    request<{ data: GogoAnimeItem[] }>(`/api/v1/streaming/gogoanime/latest`, 300),
  gogoanimeHealth: () =>
    request<{ healthy: boolean; reason?: string }>(`/api/v1/streaming/gogoanime/health`, 120),

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
    `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(url)}`,

  // Fallback (tries GogoAnime, then Anivexa)
  fallbackSearch: (q: string) =>
    request<{ data: any[]; source: string }>(`/api/v1/streaming/fallback/search?q=${encodeURIComponent(q)}`, 300),
  fallbackStream: (q: string, ep: number, audio = "sub", anilistId?: number) => {
    let path = `/api/v1/streaming/fallback/stream?q=${encodeURIComponent(q)}&ep=${ep}&audio=${audio}`;
    if (anilistId) path += `&anilist_id=${anilistId}`;
    return request<any>(path, 60);
  },
};
