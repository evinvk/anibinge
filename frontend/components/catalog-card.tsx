import Image from "next/image";
import Link from "next/link";
import { Star, Play } from "lucide-react";
import { cn, needsUnoptimized, hasValidImageUrl } from "@/lib/utils";
import type { GogoAnimeItem } from "@/lib/api";

interface CatalogCardProps {
  item: GogoAnimeItem;
  priority?: boolean;
}

export function CatalogCard({ item, priority = false }: CatalogCardProps) {
  const score = item.score != null ? Number(item.score) : null;

  return (
    <Link href={`/watch/${item.slug}`} className="group block h-full">
      <div className="glass-card aura-border flex h-full flex-col transition-transform duration-200 group-hover:-translate-y-1">
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-t-xl2">
          {hasValidImageUrl(item.poster) ? (
            <Image
              src={item.poster}
              alt={item.title_english || item.title}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              unoptimized={needsUnoptimized(item.poster)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-hi">
              <span className="text-2xl font-bold text-mist/40">{(item.title_english || item.title)?.charAt(0)}</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

          {item.type && (
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <Play className="h-3 w-3 text-white" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-white">{item.type}</span>
            </div>
          )}

          {score != null ? (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <Star className="h-3 w-3 fill-primary-400 text-primary-400" />
              <span className="font-mono text-[10px] text-white">{score.toFixed(1)}</span>
            </div>
          ) : null}

          {item.episodes_count ? (
            <div className="absolute bottom-2 right-2 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <span className="font-mono text-[10px] text-white">{item.episodes_count} eps</span>
            </div>
          ) : null}
        </div>

        <div className="flex h-20 flex-col justify-center p-3">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
            {item.title_english || item.title}
          </h3>
          {item.status ? (
            <p className="mt-1 truncate text-xs text-mist">{item.status}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function CatalogCardSkeleton() {
  return (
    <div className="glass-card w-full animate-pulse">
      <div className="aspect-[2/3] w-full rounded-t-xl2 bg-surface-hi" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded bg-surface-hi" />
        <div className="h-3 w-1/2 rounded bg-surface-hi" />
      </div>
    </div>
  );
}

export function CatalogGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      {children}
    </div>
  );
}
