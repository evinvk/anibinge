import Image from "next/image";
import Link from "next/link";
import { ChevronRight, BookOpen } from "lucide-react";
import { needsUnoptimized } from "@/lib/utils";
import type { ManhwaItem } from "@/lib/api";

interface ManhwaLatestRowProps {
  items: ManhwaItem[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="shrink-0 snap-start w-36 sm:w-44">
      <div className="relative overflow-hidden rounded-2xl bg-surface-hi animate-pulse">
        <div className="aspect-[2/3] w-full bg-surface-hi" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="h-4 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function ManhwaCard({ item }: { item: ManhwaItem }) {
  const href = `/manhwa/${item.id}`;
  const genre = item.genres?.[0] || null;

  return (
    <div className="shrink-0 snap-start w-36 sm:w-44">
      <Link href={href} className="group relative block w-full overflow-hidden aspect-[2/3] rounded-2xl transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(16,185,129,0.5)]">
        {item.poster && item.poster.startsWith("http") ? (
          <Image
            src={item.poster}
            alt={item.title}
            fill
            loading="lazy"
            sizes="176px"
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

        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 backdrop-blur-md shadow-lg">
          <BookOpen className="h-3 w-3 text-white" />
          <span className="font-mono text-[11px] font-bold text-white">
            Ch {item.chapter != null ? item.chapter : "?"}
          </span>
        </div>

        <div className="absolute right-3 top-3 z-10 rounded-full bg-void/70 px-2.5 py-1 backdrop-blur-md">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">
            {item.status === "ongoing" ? "Ongoing" : item.status === "completed" ? "Done" : "Manhwa"}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <h3 className="font-display text-sm font-bold leading-snug text-white line-clamp-2 group-hover:text-emerald-300 transition-colors">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            {genre && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{genre}</span>
            )}
            {item.rating != null && (
              <span className="text-[10px] text-amber-400">★ {item.rating}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

export function ManhwaLatestRow({ items, loading }: ManhwaLatestRowProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1 w-8 rounded-full bg-emerald-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">New Chapters</span>
          </div>
          <h2 className="font-display text-xl font-bold text-paper sm:text-2xl">
            Manhwa Updates
          </h2>
        </div>
        <Link
          href="/manhwa"
          className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))
          : items.map((item, idx) => (
              <ManhwaCard key={`${item.id}-${idx}`} item={item} />
            ))}
      </div>
    </section>
  );
}
