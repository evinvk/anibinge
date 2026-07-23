import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import type { GogoAnimeItem } from "@/lib/api";

interface LatestReleasesRowProps {
  items: GogoAnimeItem[];
  loading?: boolean;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-surface-hi/50 p-3 animate-pulse">
      <div className="h-16 w-12 shrink-0 rounded-lg bg-surface-hi" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-surface-hi" />
        <div className="h-3 w-1/3 rounded bg-surface-hi" />
      </div>
    </div>
  );
}

function LatestRow({ item }: { item: GogoAnimeItem }) {
  const title = item.title_english || item.title;
  const epLabel = item.latest_episode ? `Episode ${item.latest_episode}` : null;

  return (
    <Link href={`/watch/${item.slug}`} className="group flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-white/5">
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg">
        {item.poster ? (
          <Image
            src={item.poster}
            alt={title}
            fill
            loading="lazy"
            sizes="48px"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full bg-surface-hi" />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="h-4 w-4 fill-white text-white drop-shadow-lg" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 font-display text-sm font-semibold text-paper group-hover:text-primary-400 transition-colors">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-mist">
          {[item.type, epLabel].filter(Boolean).join(" · ") || "\u00A0"}
        </p>
      </div>

      {item.status === "Ongoing" && (
        <div className="flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-0.5 backdrop-blur-md">
          <span className="live-dot !h-1.5 !w-1.5" />
          <span className="font-mono text-[10px] uppercase tracking-wide text-white">New</span>
        </div>
      )}
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
      <div className="space-y-1">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          : items.map((item) => <LatestRow key={item.slug} item={item} />)}
      </div>
    </section>
  );
}
