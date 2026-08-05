"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Star } from "lucide-react";
import { api, AnimeSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TopTen() {
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: AnimeSummary[] = [];
      try {
        const res = await api.topRated(1);
        list = res?.data ?? [];
      } catch { /* fall through */ }
      if (list.length === 0) {
        try {
          const res = await api.trending(1);
          list = res?.data ?? [];
        } catch { /* fall through */ }
      }
      if (list.length === 0) {
        try {
          const res = await api.search("", { order_by: "popularity" });
          list = res?.data ?? [];
        } catch { /* give up */ }
      }
      if (!cancelled) {
        setItems(list.slice(0, 10));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500/20">
          <Flame className="h-4 w-4 text-primary-400" />
        </span>
        <h2 className="font-display text-base font-bold text-paper">Top 10 Today</h2>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? null : (
        <ol className="mt-3 space-y-1">
          {items.map((item, i) => (
            <li key={String(item.id)}>
              <Link
                href={`/anime/${item.id}?source=${item.source || "mal"}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
              >
                <span
                  className={cn(
                    "w-6 shrink-0 text-center font-display text-sm font-bold",
                    i < 3 ? "text-primary-400" : "text-mist/50"
                  )}
                >
                  {i + 1}
                </span>
                {item.image ? (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="h-10 w-7 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-10 w-7 shrink-0 rounded bg-surface-hi" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-mist group-hover:text-paper">
                  {item.title_english || item.title}
                </span>
                {item.score != null && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-mist/60">
                    <Star className="h-3 w-3 fill-primary-400 text-primary-400" />
                    {item.score.toFixed(1)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}

      <Link
        href="/anime"
        className="mt-3 block rounded-full bg-white/5 px-3 py-1.5 text-center text-xs font-medium text-mist transition hover:bg-white/10 hover:text-paper"
      >
        See all trending
      </Link>
    </div>
  );
}
