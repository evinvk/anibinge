"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Mic, Clock } from "lucide-react";
import type { AnimeSummary } from "@/lib/api";

const RECENT_KEY = "anibinge:recent-searches";

export function HomeSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.data?.slice(0, 8) ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const saveRecent = useCallback((term: string) => {
    const next = [term, ...JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").filter((t: string) => t !== term)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  }, []);

  function goToBrowse(term: string) {
    saveRecent(term);
    setFocused(false);
    router.push(`/browse?q=${encodeURIComponent(term)}`);
  }

  function startVoiceSearch() {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (e: any) => {
      setQuery(e.results[0][0].transcript);
    };
    recognition.start();
  }

  const showDropdown = focused && (query.trim() !== "" || recent.length > 0);

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-xl px-4">
      <div className="glass-card flex items-center gap-3 border border-white/10 px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-primary-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => e.key === "Enter" && query.trim() && goToBrowse(query.trim())}
          placeholder="Search anime titles..."
          className="w-full flex-1 bg-transparent text-sm outline-none placeholder:text-mist"
        />
        <button onClick={startVoiceSearch} aria-label="Voice search" className={listening ? "text-primary-400" : "text-mist"}>
          <Mic className="h-5 w-5" />
        </button>
      </div>

      {showDropdown && (
        <div className="glass-card absolute inset-x-4 top-full z-50 mt-2 max-h-96 overflow-y-auto p-2">
          {query.trim() === "" && recent.length > 0 && (
            <div className="p-2">
              <p className="mb-2 text-xs uppercase tracking-wide text-mist">Recent Searches</p>
              {recent.map((term) => (
                <button
                  key={term}
                  onClick={() => goToBrowse(term)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <Clock className="h-4 w-4 text-mist" /> {term}
                </button>
              ))}
            </div>
          )}

          {query.trim() !== "" && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-mist">No results — press Enter to search anyway.</p>
          )}

          {results.map((anime) => (
            <button
              key={anime.id}
              onClick={() => goToBrowse(anime.title)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5"
            >
              {anime.image && (
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded">
                  <Image src={anime.image} alt={anime.title} fill sizes="40px" className="object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{anime.title_english || anime.title}</p>
                <p className="truncate text-xs text-mist">{anime.genres?.slice(0, 3).join(", ")}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
