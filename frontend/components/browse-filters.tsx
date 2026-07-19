"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

const STATUS_OPTIONS = ["airing", "complete", "upcoming"];
const TYPE_OPTIONS = ["tv", "movie", "ova", "ona", "special"];
const SORT_OPTIONS = [
  { value: "score", label: "Score" },
  { value: "popularity", label: "Popularity" },
  { value: "title", label: "Title" },
  { value: "start_date", label: "Release Date" },
];

export function BrowseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="glass-card mt-6 flex flex-wrap items-center gap-3 p-4">
      <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-full bg-surface-hi px-4 py-2">
        <Search className="h-4 w-4 text-mist" />
        <input
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => e.key === "Enter" && setParam("q", (e.target as HTMLInputElement).value)}
          placeholder="Search titles..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-mist"
        />
      </div>

      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="rounded-full bg-surface-hi px-3 py-2 text-sm"
      >
        <option value="">Status</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        className="rounded-full bg-surface-hi px-3 py-2 text-sm"
      >
        <option value="">Format</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t.toUpperCase()}</option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("order_by") ?? ""}
        onChange={(e) => setParam("order_by", e.target.value)}
        className="rounded-full bg-surface-hi px-3 py-2 text-sm"
      >
        <option value="">Sort by</option>
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
