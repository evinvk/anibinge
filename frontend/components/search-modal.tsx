"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Mic, X, Clock } from "lucide-react";
import type { AnimeSummary } from "@/lib/api";

const RECENT_KEY = "anibinge:recent-searches";

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/search?q=${encodeURIComponent(query)}`
      );
      const json = await res.json();
      setResults(json.data?.slice(0, 8) ?? []);
    }, 250); // instant-search debounce
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const saveRecent = useCallback((term: string) => {
    const next = [term, ...JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").filter((t: string) => t !== term)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  }, []);

  function goToBrowse(term: string) {
    saveRecent(term);
    onClose();
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
      const transcript = e.results[0][0].transcript;
      setQuery(transcript);
    };
    recognition.start();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-void/80 backdrop-blur-sm pt-20 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <Search className="h-5 w-5 text-mist" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && query.trim() && goToBrowse(query.trim())}
                placeholder="Search anime titles..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-mist"
              />
              <button onClick={startVoiceSearch} aria-label="Voice search" className={listening ? "text-primary-400" : "text-mist"}>
                <Mic className="h-5 w-5" />
              </button>
              <button onClick={onClose} aria-label="Close search">
                <X className="h-5 w-5 text-mist" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
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

              {results.map((anime) => (
                <button
                  key={anime.id}
                  onClick={() => goToBrowse(anime.title)}
                  onDoubleClick={() => router.push(`/anime/${anime.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5"
                >
                  {anime.image && (
                    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded">
                      <Image src={anime.image} alt={anime.title} fill className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{anime.title_english || anime.title}</p>
                    <p className="truncate text-xs text-mist">{anime.genres?.slice(0, 3).join(", ")}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
