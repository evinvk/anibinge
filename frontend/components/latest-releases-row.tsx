import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Play, Sparkles } from "lucide-react";
import type { GogoAnimeItem } from "@/lib/api";

interface LatestReleasesRowProps {
  items: GogoAnimeItem[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-surface-hi animate-pulse">
      <div className="aspect-[2/3] w-full bg-surface-hi" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="h-4 w-3/4 rounded bg-white/10" />
        <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
      </div>
    </div>
  );
}

function LatestCard({ item, index }: { item: GogoAnimeItem; index: number }) {
  const title = item.title_english || item.title;
  const epLabel = item.latest_episode ? `Ep ${item.latest_episode}` : null;
  const isLarge = index === 0;

  return (
    <Link
      href={`/watch/${item.slug}`}
      className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(124,58,237,0.5)] ${
        isLarge ? "col-span-2 row-span-2 md:col-span-2 md:row-span-2" : ""
      }`}
    >
      <div className={`relative w-full overflow-hidden ${isLarge ? "aspect-[16/10]" : "aspect-[2/3]"}`}>
        {item.poster ? (
          <Image
            src={item.poster}
            alt={title}
            fill
            loading="lazy"
            sizes={isLarge ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"}
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full bg-surface-hi" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300" />

        {/* Sheen sweep */}
        <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

        {/* Episode badge */}
        {epLabel && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-primary-600/90 px-3 py-1 backdrop-blur-md shadow-lg">
            <Play className="h-3 w-3 fill-white text-white" />
            <span className="font-mono text-[11px] font-bold text-white">{epLabel}</span>
          </div>
        )}

        {/* Ongoing badge */}
        {item.status === "Ongoing" && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-void/70 px-2.5 py-1 backdrop-blur-md">
            <span className="live-dot !h-1.5 !w-1.5" />
            <span className="font-mono text-[10px] uppercase tracking-wide text-white">New</span>
          </div>
        )}

        {/* Play button on hover */}
        <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600/80 backdrop-blur-md shadow-glow scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Title at bottom */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-4">
          <h3 className={`font-display font-bold leading-snug text-white line-clamp-2 group-hover:text-primary-300 transition-colors ${
            isLarge ? "text-xl sm:text-2xl" : "text-sm"
          }`}>
            {title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            {item.type && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{item.type}</span>
            )}
            {item.score && parseFloat(item.score) > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary-400">
                <Sparkles className="h-2.5 w-2.5" /> {parseFloat(item.score).toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LatestReleasesRow({ items, loading }: LatestReleasesRowProps) {
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
          href="/browse?source=gogoanime"
          className="group/link flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-mist backdrop-blur-md transition-all hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400"
        >
          View all <ChevronRight className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                <SkeletonCard />
              </div>
            ))
          : items.map((item, i) => <LatestCard key={item.slug} item={item} index={i} />)}
      </div>
    </section>
  );
}
