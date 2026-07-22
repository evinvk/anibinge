"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface NewsCardProps {
  article: {
    id: string;
    title: string;
    url: string;
    summary: string;
    image: string | null;
    category: string;
    published_at: string | null;
  };
  featured?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  news: "text-blue-400",
  industry: "text-amber-400",
  trailer: "text-red-400",
  announcement: "text-green-400",
  review: "text-purple-400",
  editorial: "text-cyan-400",
};

export function NewsCard({ article, featured = false }: NewsCardProps) {
  const catColor = CATEGORY_COLORS[article.category] || "text-primary-400";

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <article
        className={cn(
          "glass-card overflow-hidden transition-transform duration-300 hover:-translate-y-1",
          featured && "sm:flex sm:h-full"
        )}
      >
        {article.image && (
          <div
            className={cn(
              "relative shrink-0 overflow-hidden",
              featured ? "aspect-video sm:aspect-auto sm:h-full sm:w-2/5" : "aspect-video"
            )}
          >
            <Image
              src={article.image}
              alt={article.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes={featured ? "(max-width: 640px) 100vw, 40vw" : "(max-width: 640px) 100vw, 33vw"}
            />
          </div>
        )}
        <div className="flex flex-col justify-between p-4">
          <div>
            <span className={cn("text-xs font-semibold uppercase tracking-wide", catColor)}>
              {article.category}
            </span>
            <h3 className="mt-1 font-display text-base font-semibold leading-snug text-paper line-clamp-2 group-hover:text-primary-400 transition-colors">
              {article.title}
            </h3>
            {article.summary && (
              <p className="mt-2 line-clamp-2 text-sm text-mist">{article.summary}</p>
            )}
          </div>
          {article.published_at && (
            <time className="mt-3 text-xs text-mist/60">
              {new Date(article.published_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          )}
        </div>
      </article>
    </a>
  );
}

export function NewsCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div className={cn("glass-card animate-pulse overflow-hidden", featured && "sm:flex sm:h-64")}>
      <div className={cn("bg-surface-hi", featured ? "sm:h-full sm:w-2/5" : "aspect-video")} />
      <div className="flex-1 space-y-3 p-4">
        <div className="h-3 w-16 rounded bg-surface-hi" />
        <div className="h-4 w-4/5 rounded bg-surface-hi" />
        <div className="h-3 w-3/5 rounded bg-surface-hi" />
      </div>
    </div>
  );
}
