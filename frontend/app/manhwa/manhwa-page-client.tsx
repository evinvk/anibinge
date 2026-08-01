"use client";

import { useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { api, type ManhwaItem } from "@/lib/api";
import { ManhwaCard } from "@/components/manhwa-card";
import { Pagination } from "@/components/pagination";

interface ManhwaPageClientProps {
  initialItems: ManhwaItem[];
  currentPage: number;
  totalPages: number;
}

export default function ManhwaPageClient({ initialItems, currentPage, totalPages }: ManhwaPageClientProps) {
  const [searchResults, setSearchResults] = useState<ManhwaItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await api.manhwaSearch(q);
      setSearchResults(r.data || []);
      setSearchedFor(q.trim());
    } catch {
      setSearchResults([]);
      setSearchedFor(q.trim());
    }
    setSearching(false);
  }, []);

  const items = searchResults ?? initialItems;

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 rounded-full bg-emerald-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">Manhwa</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-paper sm:text-4xl">
            Korean Comics
          </h1>
          <p className="mt-2 text-sm text-mist">Discover and read manhwa — powered by MangaDex</p>
        </div>

        <div className="mb-10">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); handleSearch(e.target.value); }}
              placeholder="Search manhwa..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-paper placeholder-mist/50 backdrop-blur-md transition-colors focus:border-emerald-400/40 focus:outline-none focus:ring-1 focus:ring-emerald-400/20"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-mist" />}
          </div>
        </div>

        {searchResults !== null && (
          <section className="mb-12">
            <h2 className="mb-4 font-display text-xl font-bold text-paper">
              Search Results {searchedFor && `for "${searchedFor}"`}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-mist">No results found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {searchResults.map((item) => (
                  <div key={item.id} className="w-full">
                    <ManhwaCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {searchResults === null && (
          <section className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
                  <Search className="h-4 w-4 text-emerald-400" />
                </div>
                <h2 className="font-display text-xl font-bold text-paper">All Manhwa</h2>
              </div>
              <span className="text-xs text-mist">Page {currentPage} of {totalPages}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-mist">No manhwa available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((item) => (
                  <div key={item.id} className="w-full">
                    <ManhwaCard item={item} />
                  </div>
                ))}
              </div>
            )}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              buildHref={(p) => (p === 1 ? "/manhwa" : `/manhwa?page=${p}`)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
