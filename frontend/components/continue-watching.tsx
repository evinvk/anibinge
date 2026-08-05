"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, X, History } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { loadHistory, removeEntry, WatchHistoryEntry } from "@/lib/watch-history";

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ContinueWatching() {
  const { user } = useAuth();
  const scope = user?.id ?? "guest";
  const [entries, setEntries] = useState<WatchHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory(scope));
  }, [scope]);

  if (entries.length === 0) return null;

  const remove = (slug: string) => {
    removeEntry(scope, slug);
    setEntries((prev) => prev.filter((e) => e.slug !== slug));
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500/20">
          <History className="h-4 w-4 text-primary-400" />
        </span>
        <h2 className="font-display text-lg font-bold text-paper">Continue Watching</h2>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {entries.map((e) => {
          const pct = e.duration > 0 ? Math.min(100, (e.time / e.duration) * 100) : 0;
          return (
            <div
              key={e.slug}
              className="group relative w-60 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-surface-hi"
            >
              <Link href={`/watch/${e.slug}?ep=${Math.max(1, e.ep)}`} className="block">
                <div className="relative flex h-32 w-full items-center justify-center bg-gradient-to-br from-primary-600/20 via-surface-hi to-surface-hi">
                  {e.image ? (
                    <img src={e.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-4 text-center font-display text-lg font-bold text-paper/80 line-clamp-2">
                      {e.title}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {e.ep > 1 ? `Ep ${e.ep}` : "Episode 1"}
                  </span>
                  {e.time > 0 && e.duration > 0 && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-primary-300">
                      {fmtTime(e.time)} left
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 shadow-glow-sm">
                      <Play className="h-4 w-4 text-white" />
                    </span>
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-semibold text-paper">{e.title}</p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
              <button
                onClick={() => remove(e.slug)}
                aria-label={`Remove ${e.title} from continue watching`}
                className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/60 p-1 text-white/70 opacity-0 transition group-hover:opacity-100 hover:bg-black/90 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
