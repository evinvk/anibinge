"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, Flame, Radio, ChevronDown } from "lucide-react";
import { api, type AnimeSummary } from "@/lib/api";
import { AnimeCard, AnimeCardSkeleton, AnimeGrid } from "@/components/anime-card";

export default function AnimePage() {
  const [popular, setPopular] = useState<AnimeSummary[]>([]);
  const [airing, setAiring] = useState<AnimeSummary[]>([]);
  const [searchResults, setSearchResults] = useState<AnimeSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingAiring, setLoadingAiring] = useState(true);
  const [searching, setSearching] = useState(false);

  const [popularPage, setPopularPage] = useState(1);
  const [loadingMorePopular, setLoadingMorePopular] = useState(false);
  const [noMorePopular, setNoMorePopular] = useState(false);

  const seenIdsRef = useRef(new Set<string | number>());
  const seenKey = (i: AnimeSummary) => `${i.source}:${i.id}`;

  useEffect(() => {
    api.trending(1).then((r) => {
      const items = r.data || [];
      items.forEach((i) => seenIdsRef.current.add(seenKey(i)));
      setPopular(items);
      setLoadingPopular(false);
    }).catch(() => setLoadingPopular(false));

    api.airing(1).then((r) => {
      const items = (r.data || []) as AnimeSummary[];
      items.forEach((i) => seenIdsRef.current.add(seenKey(i)));
      setAiring(items);
      setLoadingAiring(false);
    }).catch(() => setLoadingAiring(false));
  }, []);

  const loadMorePopular = useCallback(async () => {
    if (loadingMorePopular || noMorePopular) return;
    setLoadingMorePopular(true);
    try {
      const r = await api.trending(popularPage + 1);
      const items = (r.data || []).filter((i) => !seenIdsRef.current.has(seenKey(i)));
      items.forEach((i) => seenIdsRef.current.add(seenKey(i)));
      if (items.length === 0) {
        setNoMorePopular(true);
      } else {
        setPopular((prev) => [...prev, ...items]);
        setPopularPage((p) => p + 1);
      }
    } catch {
      setNoMorePopular(true);
    }
    setLoadingMorePopular(false);
  }, [popularPage, loadingMorePopular, noMorePopular]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await api.search(q);
      setSearchResults(r.data || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, []);

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 rounded-full bg-primary-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-primary-400">Anime</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper sm:text-4xl">
            Japanese Animation
          </h1>
          <p className="mt-2 text-sm text-mist">Stream the latest anime with subtitles and dubs</p>
        </div>

        {/* Search */}
        <div className="mb-10">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); handleSearch(e.target.value); }}
              placeholder="Search anime..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-paper placeholder-mist/50 backdrop-blur-md transition-colors focus:border-primary-400/40 focus:outline-none focus:ring-1 focus:ring-primary-400/20"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-mist" />}
          </div>
        </div>

        {/* Search Results */}
        {searchResults !== null && (
          <section className="mb-12">
            <h2 className="mb-4 font-display text-xl font-bold text-paper">
              Search Results {query && `for "${query}"`}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-mist">No results found.</p>
            ) : (
              <AnimeGrid>
                {searchResults.map((item) => (
                  <AnimeCard key={`${item.source}:${item.id}`} anime={item} />
                ))}
              </AnimeGrid>
            )}
          </section>
        )}

        {/* Popular */}
        {searchResults === null && (
          <>
            <section className="mb-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/20">
                  <Flame className="h-4 w-4 text-primary-400" />
                </div>
                <h2 className="font-display text-xl font-bold text-paper">Popular Now</h2>
              </div>
              {loadingPopular ? (
                <AnimeGrid>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <AnimeCardSkeleton key={i} />
                  ))}
                </AnimeGrid>
              ) : popular.length === 0 ? (
                <p className="text-mist">No popular anime available.</p>
              ) : (
                <>
                  <AnimeGrid>
                    {popular.map((item) => (
                      <AnimeCard key={`${item.source}:${item.id}`} anime={item} />
                    ))}
                  </AnimeGrid>
                  {!noMorePopular ? (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={loadMorePopular}
                        disabled={loadingMorePopular}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-paper backdrop-blur-md transition-all hover:border-primary-400/40 hover:bg-primary-500/10 hover:text-primary-300 disabled:opacity-50"
                      >
                        {loadingMorePopular ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {loadingMorePopular ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-6 text-center text-xs text-mist/50">No more results</p>
                  )}
                </>
              )}
            </section>

            {/* Airing Now */}
            <section className="mb-12">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/20">
                  <Radio className="h-4 w-4 text-primary-400" />
                </div>
                <h2 className="font-display text-xl font-bold text-paper">Airing Now</h2>
              </div>
              {loadingAiring ? (
                <AnimeGrid>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <AnimeCardSkeleton key={i} />
                  ))}
                </AnimeGrid>
              ) : airing.length === 0 ? (
                <p className="text-mist">No airing anime available.</p>
              ) : (
                <AnimeGrid>
                  {airing.map((item) => (
                    <AnimeCard key={`${item.source}:${item.id}`} anime={item} />
                  ))}
                </AnimeGrid>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
