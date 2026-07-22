"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Star, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnimeSummary } from "@/lib/api";

interface AnimeCardProps {
  anime: AnimeSummary;
  priority?: boolean;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

export function AnimeCard({ anime, priority = false }: AnimeCardProps) {
  const isAiring = anime.status === "Currently Airing" || anime.status === "RELEASING";
  const isUpcoming = anime.status === "Not yet aired" || anime.status === "NOT_YET_RELEASED";
  const releaseDate = formatDate(anime.start_date);

  const metaLine = [
    anime.format,
    anime.episodes ? `${anime.episodes} eps` : null,
    isUpcoming && releaseDate ? releaseDate : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={anime.source === "anilist" ? `/anime/${anime.id}?source=anilist` : `/anime/${anime.id}`}
      className="group block"
    >
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="glass-card aura-border w-full"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl2">
          {anime.image ? (
            <Image
              src={anime.image}
              alt={anime.title_english || anime.title}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-surface-hi" />
          )}

          {/* sheen sweep on hover */}
          <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

          {isAiring && (
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <span className="live-dot" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-white">Airing</span>
            </div>
          )}

          {isUpcoming && (
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-primary-600/80 px-2 py-1 backdrop-blur-md">
              <Clock className="h-3 w-3 text-white" />
              <span className="font-mono text-[10px] uppercase tracking-wide text-white">Upcoming</span>
            </div>
          )}

          {anime.score ? (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <Star className="h-3 w-3 fill-primary-400 text-primary-400" />
              <span className="font-mono text-[10px] text-white">{anime.score.toFixed(1)}</span>
            </div>
          ) : null}
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
            {anime.title_english || anime.title}
          </h3>
          <p className="mt-1 truncate text-xs text-mist">
            {metaLine || "\u00A0"}
          </p>
          {isUpcoming && releaseDate && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary-400">
              <Clock className="h-3 w-3 shrink-0" />
              {releaseDate}
            </p>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export function AnimeCardSkeleton() {
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

export function AnimeGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
