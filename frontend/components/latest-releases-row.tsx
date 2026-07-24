import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Play, Clock, Loader2 } from "lucide-react";
import { needsUnoptimized } from "@/lib/utils";
import type { RecentEpisode } from "@/lib/api";

interface LatestReleasesRowProps {
  items: RecentEpisode[];
  loading?: boolean;
  loadingMore?: boolean;
  hasNext?: boolean;
  onLoadMore?: () => void;
}

function timeAgo(seconds: number): string {
  if (seconds <= 0) return "Just now";
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function SkeletonCard() {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-surface-hi animate-pulse">
      <div className="aspect-[2/3] w-full bg-surface-hi" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="h-4 w-3/4 rounded bg-white/10" />
        <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
      </div>
    </div>
  );
}

function EpisodeCard({ item }: { item: RecentEpisode }) {
  const href = item.slug ? `/watch/${item.slug}` : `/anime/${item.anilist_id}`;
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

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300" />

        {/* Sheen sweep */}
        <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

        {/* Episode badge - top left */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-primary-600/90 px-3 py-1 backdrop-blur-md shadow-lg">
          <Play className="h-3 w-3 fill-white text-white" />
          <span className="font-mono text-[11px] font-bold text-white">Ep {item.episode}</span>
        </div>

        {/* Sub badge - top right */}
        <div className="absolute right-3 top-3 z-10 rounded-full bg-void/70 px-2.5 py-1 backdrop-blur-md">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">Sub</span>
        </div>

        {/* Play button on hover */}
        <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600/80 backdrop-blur-md shadow-glow scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Title + time at bottom */}
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

export function LatestReleasesRow({ items, loading, loadingMore, hasNext, onLoadMore }: LatestReleasesRowProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 rounded-full bg-primary-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-primary-400">Fresh Drops</span>
          </div>
          <h2 className="font-display text-3xl font-bold text-paper sm:text-4xl">
            Latest Releases
          </h2>
        </div>
        <Link
          href="/browse?sort=trending"
          className="group/link flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-mist backdrop-blur-md transition-all hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
        >
          View all <ChevronRight className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))
          : items.map((item, idx) => (
              <EpisodeCard
                key={`${item.anilist_id}-${item.episode}-${idx}`}
                item={item}
              />
            ))}
      </div>

      {/* Load More */}
      {!loading && items.length > 0 && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={onLoadMore}
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
    </section>
  );
}
