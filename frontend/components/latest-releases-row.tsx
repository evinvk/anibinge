import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import type { GogoAnimeItem } from "@/lib/api";

interface LatestReleasesRowProps {
  items: GogoAnimeItem[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="glass-card w-36 shrink-0 animate-pulse sm:w-44">
      <div className="aspect-[2/3] w-full rounded-t-xl2 bg-surface-hi" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded bg-surface-hi" />
        <div className="h-3 w-1/2 rounded bg-surface-hi" />
      </div>
    </div>
  );
}

function LatestCard({ item }: { item: GogoAnimeItem }) {
  const title = item.title_english || item.title;
  const epLabel = item.latest_episode ? `Ep ${item.latest_episode}` : null;

  return (
    <Link href={`/watch/${item.slug}`} className="group block">
      <div className="glass-card aura-border w-full transition-transform duration-200 group-hover:-translate-y-1">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl2">
          {item.poster ? (
            <Image
              src={item.poster}
              alt={title}
              fill
              loading="lazy"
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-surface-hi" />
          )}

          <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

          {/* Airing badge */}
          {item.status === "Ongoing" && (
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <span className="live-dot" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-white">Airing</span>
            </div>
          )}

          {/* Score badge */}
          {item.score && parseFloat(item.score) > 0 && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <span className="font-mono text-[10px] text-primary-400">
                {parseFloat(item.score).toFixed(1)}
              </span>
            </div>
          )}

          {/* Play overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600/80 backdrop-blur-sm">
              <Play className="h-4 w-4 fill-white text-white ml-0.5" />
            </div>
          </div>
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
            {title}
          </h3>
          <p className="mt-1 truncate text-xs text-mist">
            {[item.type, epLabel].filter(Boolean).join(" · ") || "\u00A0"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function LatestReleasesRow({ items, loading }: LatestReleasesRowProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-paper sm:text-2xl">
          Latest Releases
        </h2>
        <Link
          href="/browse?source=gogoanime"
          className="flex items-center text-sm text-primary-400 hover:text-primary-300"
        >
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-36 shrink-0 snap-start sm:w-44">
                <SkeletonCard />
              </div>
            ))
          : items.map((item) => (
              <div key={item.slug} className="w-36 shrink-0 snap-start sm:w-44">
                <LatestCard item={item} />
              </div>
            ))}
      </div>
    </section>
  );
}
