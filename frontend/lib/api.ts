const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AnimeSummary {
  id: number;
  source: "jikan" | "anilist";
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
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, revalidateSeconds = 60): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: revalidateSeconds }, // Next.js ISR-style caching on top of Redis
  });
  if (!res.ok) throw new ApiError(res.status, `Request to ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  trending: (page = 1) => request<{ data: AnimeSummary[] }>(`/api/v1/anime/trending?page=${page}`, 300),
  topRated: (page = 1) => request<any>(`/api/v1/anime/top-rated?page=${page}`, 3600),
  airing: (page = 1) => request<any>(`/api/v1/anime/airing?page=${page}`, 300),
  upcoming: (page = 1) => request<any>(`/api/v1/anime/upcoming?page=${page}`, 3600),
  detail: (id: number) => request<any>(`/api/v1/anime/${id}`, 3600),
  characters: (id: number) => request<any>(`/api/v1/anime/${id}/characters`, 86400),
  staff: (id: number) => request<any>(`/api/v1/anime/${id}/staff`, 86400),
  episodes: (id: number, page = 1) => request<any>(`/api/v1/anime/${id}/episodes?page=${page}`, 3600),
  recommendations: (id: number) => request<any>(`/api/v1/anime/${id}/recommendations`, 86400),
  currentSeason: (page = 1) => request<any>(`/api/v1/seasonal/current?page=${page}`, 3600),
  season: (year: number, season: string, page = 1) =>
    request<any>(`/api/v1/seasonal/${year}/${season}?page=${page}`, 3600),
  weeklySchedule: () => request<any>(`/api/v1/schedule/weekly`, 300),
  daySchedule: (day: string) => request<any>(`/api/v1/schedule/${day}`, 300),
  search: (q: string, params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams({ q, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    return request<{ data: AnimeSummary[] }>(`/api/v1/search?${qs.toString()}`, 60);
  },
  genres: () => request<any>(`/api/v1/search/genres`, 86400),
};
