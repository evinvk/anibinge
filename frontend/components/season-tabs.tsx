"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface SeasonTabsProps {
  currentYear: number;
  currentSeason: string;
  seasons: readonly string[];
}

export function SeasonTabs({ currentYear, currentSeason, seasons }: SeasonTabsProps) {
  const router = useRouter();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <select
        value={currentYear}
        onChange={(e) => router.push(`/seasonal?year=${e.target.value}&season=${currentSeason}`)}
        className="rounded-full bg-surface-hi px-4 py-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <div className="flex gap-1 rounded-full bg-surface-hi p-1">
        {seasons.map((s) => (
          <button
            key={s}
            onClick={() => router.push(`/seasonal?year=${currentYear}&season=${s}`)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm capitalize transition-colors",
              s === currentSeason ? "bg-primary-600 text-white" : "text-mist hover:text-paper"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
