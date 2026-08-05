"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Star, Loader2 } from "lucide-react";
import { api, AnimeSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

const LETTERS = ["0-9", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

function normalize(title: string): string {
  const t = title.trim().toLowerCase();
  if (/^[a-z0-9]/.test(t)) return t;
  return "other";
}

export function AzIndex() {
  const [letter, setLetter] = useState("A");
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadLetter = useCallback(async (l: string) => {
    setLoading(true);
    setError(false);
    const query = l === "0-9" ? "0" : l;
    const pages = await Promise.all(
      [1, 2, 3].map((p) =>
        api.search(query, { order_by: "title", sort: "asc", page: p }).catch(() => ({ data: [] as AnimeSummary[] }))
      )
    );
    const all = pages.flatMap((r) => r.data ?? []);
    const seen = new Set<number | string>();
    const deduped = all.filter((m) => {
      const key = String(m.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const filtered = deduped.filter((m) => {
      const t = normalize(m.title_english || m.title);
      if (l === "0-9") return /^[0-9]/.test(t);
      if (l === "other") return false;
      return t.startsWith(l.toLowerCase());
    });
    const fallback = filtered.length >= 12 ? filtered : [...filtered, ...deduped.filter((m) => !filtered.includes(m))];
    setItems(fallback.slice(0, 60));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLetter(letter);
  }, [letter, loadLetter]);

  const sectioned = useMemo(() => {
    const groups = new Map<string, AnimeSummary[]>();
    for (const m of items) {
      const key = normalize(m.title_english || m.title);
      const head = key[0]?.toUpperCase() || "#";
      if (!groups.has(head)) groups.set(head, []);
      groups.get(head)!.push(m);
    }
    return [...groups.entries()];
  }, [items]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {LETTERS.map((l) => (
          <button
            key={l}
            onClick={() => setLetter(l)}
            className={cn(
              "h-8 w-9 rounded-md text-xs font-bold transition",
              letter === l
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10 hover:text-paper"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-mist">
        {loading
          ? "Loading titles…"
          : items.length > 0
            ? `Showing titles starting with “${letter}”`
            : `No titles found for “${letter}” yet.`}
      </p>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-16 text-mist">
          <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error && items.length === 0 ? (
        <p className="mt-6 py-16 text-center text-sm text-mist">Couldn&apos;t load titles. Try again in a moment.</p>
      ) : sectioned.length === 0 ? null : (
        <div className="mt-6 space-y-6">
          {sectioned.map(([head, group]) => (
            <section key={head}>
              <h3 className="sticky top-16 z-10 -mx-1 rounded-md bg-void/90 px-2 py-1 font-mono text-sm font-bold text-primary-400 backdrop-blur-sm">
                {head}
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
                {group.map((m) => (
                  <Link
                    key={String(m.id)}
                    href={`/anime/${m.id}?source=${m.source || "mal"}`}
                    className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
                  >
                    {m.image ? (
                      <img src={m.image} alt="" loading="lazy" className="h-9 w-6 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-9 w-6 shrink-0 rounded bg-surface-hi" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-mist group-hover:text-paper">
                        {m.title_english || m.title}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-mist/50">
                        {m.year || "—"}
                        {m.score != null && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5 fill-primary-400 text-primary-400" />
                            {m.score.toFixed(1)}
                          </span>
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
