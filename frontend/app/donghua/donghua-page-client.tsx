"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, Flame, Clock, ChevronDown } from "lucide-react";
import { api, type DonghuaItem } from "@/lib/api";
import { DonghuaCard, DonghuaCardSkeleton } from "@/components/donghua-card";
import { DonghuaEpisodeCard, DonghuaEpisodeCardSkeleton } from "@/components/donghua-episode-card";

export default function DonghuaPage() {
  const [trending, setTrending] = useState<DonghuaItem[]>([]);
  const [latest, setLatest] = useState<DonghuaItem[]>([]);
  const [searchResults, setSearchResults] = useState<DonghuaItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [searching, setSearching] = useState(false);

  const [trendingPage, setTrendingPage] = useState(1);
  const [latestPage, setLatestPage] = useState(2);
  const [loadingMoreTrending, setLoadingMoreTrending] = useState(false);
  const [loadingMoreLatest, setLoadingMoreLatest] = useState(false);
  const [noMoreTrending, setNoMoreTrending] = useState(false);
  const [noMoreLatest, setNoMoreLatest] = useState(false);

  const seenSlugsRef = useRef(new Set<string>());
  const seenKey = (i: DonghuaItem) => `${i.slug}:${i.episode ?? "full"}`;

  useEffect(() => {
    api.donghuaTrending().then((r) => {
      const items = r.data || [];
      items.forEach((i) => seenSlugsRef.current.add(seenKey(i)));
      setTrending(items);
      setLoadingTrending(false);
    }).catch(() => setLoadingTrending(false));

    api.donghuaLatest(1).then((r) => {
      const items = r.data || [];
      items.forEach((i) => seenSlugsRef.current.add(seenKey(i)));
      setLatest(items);
      setLoadingLatest(false);
    }).catch(() => setLoadingLatest(false));
  }, []);

  const loadMoreTrending = useCallback(async () => {
    if (loadingMoreTrending || noMoreTrending) return;
    setLoadingMoreTrending(true);
    try {
      const r = await api.donghuaBrowse(trendingPage);
      const items = (r.data || []).filter((i) => !seenSlugsRef.current.has(seenKey(i)));
      items.forEach((i) => seenSlugsRef.current.add(seenKey(i)));
      if (items.length === 0) {
        setNoMoreTrending(true);
      } else {
        setTrending((prev) => [...prev, ...items]);
        setTrendingPage((p) => p + 1);
      }
    } catch {
      setNoMoreTrending(true);
    }
    setLoadingMoreTrending(false);
  }, [trendingPage, loadingMoreTrending, noMoreTrending]);

  const loadMoreLatest = useCallback(async () => {
    if (loadingMoreLatest || noMoreLatest) return;
    setLoadingMoreLatest(true);
    try {
      const r = await api.donghuaLatest(latestPage);
      const items = (r.data || []).filter((i) => !seenSlugsRef.current.has(seenKey(i)));
      items.forEach((i) => seenSlugsRef.current.add(seenKey(i)));
      if (items.length === 0) {
        setNoMoreLatest(true);
      } else {
        setLatest((prev) => [...prev, ...items]);
        setLatestPage((p) => p + 1);
      }
    } catch {
      setNoMoreLatest(true);
    }
    setLoadingMoreLatest(false);
  }, [latestPage, loadingMoreLatest, noMoreLatest]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await api.donghuaSearch(q);
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
            <div className="h-1 w-8 rounded-full bg-red-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-red-400">Donghua</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper sm:text-4xl">
            Chinese Animation
          </h1>
          <p className="mt-2 text-sm text-mist">Stream the latest Chinese donghua with subtitles</p>
        </div>

        {/* Search */}
        <div className="mb-10">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); handleSearch(e.target.value); }}
              placeholder="Search donghua..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-paper placeholder-mist/50 backdrop-blur-md transition-colors focus:border-red-400/40 focus:outline-none focus:ring-1 focus:ring-red-400/20"
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {searchResults.map((item) => (
                  <div key={item.slug} className="w-full">
                    <DonghuaCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Trending */}
        {searchResults === null && (
          <>
            <section className="mb-12">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
                    <Flame className="h-4 w-4 text-red-400" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-paper">Popular Today</h2>
                </div>
              </div>
              {loadingTrending ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <DonghuaCardSkeleton key={i} />
                  ))}
                </div>
              ) : trending.length === 0 ? (
                <p className="text-mist">No trending donghua available.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {trending.map((item) => (
                      <div key={item.slug} className="w-full">
                        <DonghuaCard item={item} />
                      </div>
                    ))}
                  </div>
                  {!noMoreTrending ? (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={loadMoreTrending}
                        disabled={loadingMoreTrending}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-paper backdrop-blur-md transition-all hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      >
                        {loadingMoreTrending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {loadingMoreTrending ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-6 text-center text-xs text-mist/50">No more results</p>
                  )}
                </>
              )}
            </section>

            {/* Latest */}
            <section className="mb-12">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
                    <Clock className="h-4 w-4 text-red-400" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-paper">Latest Releases</h2>
                </div>
              </div>
              {loadingLatest ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <DonghuaEpisodeCardSkeleton key={i} />
                  ))}
                </div>
              ) : latest.length === 0 ? (
                <p className="text-mist">No latest donghua available.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {latest.map((item) => (
                      <div key={`${item.slug}-${item.episode || 0}`} className="w-full">
                        <DonghuaEpisodeCard item={item} />
                      </div>
                    ))}
                  </div>
                  {!noMoreLatest ? (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={loadMoreLatest}
                        disabled={loadingMoreLatest}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-paper backdrop-blur-md transition-all hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      >
                        {loadingMoreLatest ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {loadingMoreLatest ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-6 text-center text-xs text-mist/50">No more results</p>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
