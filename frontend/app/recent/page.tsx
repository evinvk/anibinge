"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Play, Clock, ChevronLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { needsUnoptimized } from "@/lib/utils";
import type { RecentEpisode } from "@/lib/api";

const PAGE_SIZE = 20;

function timeAgo(seconds: number): string {
  if (seconds <= 0) return "Just now";
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function EpisodeCard({ item }: { item: RecentEpisode }) {
  const href = item.slug ? `/watch/${item.slug}?ep=${item.episode}` : `/anime/${item.anilist_id}`;
  const genre = item.genres?.[0] || null;

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(124,58,237,0.5)]"
    >
      <div className="relative w-full overflow-hidden aspect-[2/3]">
        {item.poster && item.poster.startsWith("http") ? (
          <Image
            src={item.poster}
            alt={item.title}
            fill
            loading="lazy"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            unoptimized={needsUnoptimized(item.poster)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-hi">
            <span className="text-3xl font-bold text-mist/40">{item.title?.charAt(0)}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300" />
        <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-primary-600/90 px-3 py-1 backdrop-blur-md shadow-lg">
          <Play className="h-3 w-3 fill-white text-white" />
          <span className="font-mono text-[11px] font-bold text-white">Ep {item.episode}</span>
        </div>

        <div className="absolute right-3 top-3 z-10 rounded-full bg-void/70 px-2.5 py-1 backdrop-blur-md">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">Sub</span>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600/80 backdrop-blur-md shadow-glow scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <h3 className="font-display text-sm font-bold leading-snug text-white line-clamp-2 group-hover:text-primary-300 transition-colors">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            {genre && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{genre}</span>
            )}
            <span className="flex items-center gap-0.5 text-[10px] text-mist">
              <Clock className="h-2.5 w-2.5" /> {timeAgo(item.aired_ago)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function RecentEpisodesPage() {
  const [items, setItems] = useState<RecentEpisode[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        const res = await api.recentEpisodes(pageNum, PAGE_SIZE);
        setItems((prev) => (append ? [...prev, ...res.data] : res.data || []));
        setHasNext(res.has_next);
        setPage(pageNum);
      } catch {
        if (!append) setItems([]);
        setHasNext(false);
      }
    },
    [],
  );

  if (!fetched) {
    setFetched(true);
    fetchPage(1, false).finally(() => setLoading(false));
  }

  const loadMore = async () => {
    setLoadingMore(true);
    await fetchPage(page + 1, true);
    setLoadingMore(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-1 w-8 rounded-full bg-primary-500" />
          <span className="font-mono text-xs uppercase tracking-widest text-primary-400">Fresh Drops</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-paper sm:text-4xl">
          Latest Releases
        </h1>
        <p className="mt-2 text-mist">Recently aired episodes, newest first.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-surface-hi animate-pulse">
                <div className="aspect-[2/3] w-full bg-surface-hi" />
              </div>
            ))
          : items.map((item, idx) => (
              <EpisodeCard key={`${item.anilist_id}-${item.episode}-${idx}`} item={item} />
            ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="mt-16 text-center text-mist">No episodes found.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore || !hasNext}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-mist backdrop-blur-md transition-all hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : hasNext ? (
              <>
                <ChevronLeft className="h-4 w-4 -rotate-90" />
                Load more episodes
              </>
            ) : (
              "No more episodes"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
