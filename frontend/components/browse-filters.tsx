"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";

const STATUS_OPTIONS = ["airing", "complete", "upcoming"];
const TYPE_OPTIONS = ["tv", "movie", "ova", "ona", "special"];
const SEASON_OPTIONS = ["winter", "spring", "summer", "fall"];
const YEARS = Array.from({ length: 28 }, (_, i) => 2026 - i);
const SORT_OPTIONS = [
  { value: "score", label: "Score" },
  { value: "popularity", label: "Popularity" },
  { value: "title", label: "Title" },
  { value: "start_date", label: "Release Date" },
];
const POPULAR_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy",
  "Horror", "Mystery", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller",
];

export function BrowseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [genres, setGenres] = useState<string[]>([]);

  const currentQ = searchParams.get("q") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentType = searchParams.get("type") ?? "";
  const currentOrderBy = searchParams.get("order_by") ?? "";
  const currentYear = searchParams.get("year") ?? "";
  const currentSeason = searchParams.get("season") ?? "";
  const currentGenres = searchParams.get("genres") ?? "";

  useEffect(() => {
    api.genres().then((r) => {
      const list = Array.isArray(r) ? r : r?.data || [];
      if (list.length > 0) setGenres(list.map((g: any) => g.name || g));
    }).catch(() => {});
  }, []);

  const genreOptions = genres.length > 0 ? genres : POPULAR_GENRES;

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleGenre(genre: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("genres") ?? "";
    const list = current ? current.split(",") : [];
    const idx = list.indexOf(genre);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(genre);
    }
    if (list.length > 0) params.set("genres", list.join(","));
    else params.delete("genres");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  const selectedGenres = currentGenres ? currentGenres.split(",") : [];
  const hasFilters = currentStatus || currentType || currentOrderBy || currentYear || currentSeason || selectedGenres.length > 0;

  return (
    <div className="mt-6 space-y-4">
      {/* Search + dropdowns */}
      <div className="glass-card flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-full bg-surface-hi px-4 py-2">
          <Search className="h-4 w-4 text-mist" />
          <input
            defaultValue={currentQ}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setParam("q", (e.target as HTMLInputElement).value);
              }
            }}
            placeholder="Search titles..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-mist"
          />
        </div>

        <select
          value={currentStatus}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-full bg-surface-hi px-3 py-2 text-sm"
        >
          <option value="">Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          value={currentType}
          onChange={(e) => setParam("type", e.target.value)}
          className="rounded-full bg-surface-hi px-3 py-2 text-sm"
        >
          <option value="">Format</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t.toUpperCase()}</option>
          ))}
        </select>

        <select
          value={currentOrderBy}
          onChange={(e) => setParam("order_by", e.target.value)}
          className="rounded-full bg-surface-hi px-3 py-2 text-sm"
        >
          <option value="">Sort by</option>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={currentYear}
          onChange={(e) => setParam("year", e.target.value)}
          className="rounded-full bg-surface-hi px-3 py-2 text-sm"
        >
          <option value="">Year</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>

        <select
          value={currentSeason}
          onChange={(e) => setParam("season", e.target.value)}
          className="rounded-full bg-surface-hi px-3 py-2 text-sm"
        >
          <option value="">Season</option>
          {SEASON_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/20"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Genre pills */}
      <div className="flex flex-wrap gap-2">
        {genreOptions.map((g) => {
          const name = typeof g === "string" ? g : g;
          const active = selectedGenres.includes(name);
          return (
            <button
              key={name}
              onClick={() => toggleGenre(name)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-red-500 text-white"
                  : "bg-white/5 text-mist border border-white/10 hover:border-red-400/30 hover:text-paper"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {selectedGenres.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-mist">
          <span>Filtering by:</span>
          {selectedGenres.map((g) => (
            <button
              key={g}
              onClick={() => toggleGenre(g)}
              className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-red-400 transition-colors hover:bg-red-500/20"
            >
              {g} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
