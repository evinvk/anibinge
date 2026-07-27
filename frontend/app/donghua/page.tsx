"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Flame, Clock, ArrowRight } from "lucide-react";
import { api, type DonghuaItem } from "@/lib/api";
import { DonghuaCard, DonghuaCardSkeleton } from "@/components/donghua-card";
import Link from "next/link";

export default function DonghuaPage() {
  const [trending, setTrending] = useState<DonghuaItem[]>([]);
  const [latest, setLatest] = useState<DonghuaItem[]>([]);
  const [searchResults, setSearchResults] = useState<DonghuaItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.donghuaTrending().then((r) => { setTrending(r.data || []); setLoadingTrending(false); }).catch(() => setLoadingTrending(false));
    api.donghuaLatest(1).then((r) => { setLatest(r.data || []); setLoadingLatest(false); }).catch(() => setLoadingLatest(false));
  }, []);

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
          <p className="mt-2 text-sm text-mist">Stream donghua with subtitles — powered by AnimeXin</p>
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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {trending.map((item) => (
                    <div key={item.slug} className="w-full">
                      <DonghuaCard item={item} />
                    </div>
                  ))}
                </div>
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
                    <DonghuaCardSkeleton key={i} />
                  ))}
                </div>
              ) : latest.length === 0 ? (
                <p className="text-mist">No latest donghua available.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {latest.map((item) => (
                    <div key={item.slug} className="w-full">
                      <DonghuaCard item={item} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
