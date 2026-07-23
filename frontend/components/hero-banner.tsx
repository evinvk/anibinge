import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import type { AnimeSummary } from "@/lib/api";

export function HeroBanner({ anime }: { anime: AnimeSummary }) {
  return (
    <section className="relative h-[50vh] min-h-[320px] w-full overflow-hidden sm:h-[70vh] sm:min-h-[480px]">
      {anime.banner || anime.image ? (
        <Image
          src={anime.banner || anime.image!}
          alt={anime.title_english || anime.title}
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-void/90 via-void/20 to-transparent" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16">
        <div className="max-w-2xl animate-[fadeInUp_0.6s_ease-out]">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-600/20 px-3 py-1 font-mono text-xs uppercase tracking-wider text-primary-400">
            <span className="live-dot" /> This Season's #1
          </span>
          <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
            {anime.title_english || anime.title}
          </h1>
          {anime.synopsis && (
            <p className="mt-4 line-clamp-3 text-sm text-mist sm:text-base">{anime.synopsis}</p>
          )}
          <div className="mt-6 flex gap-3">
            <Link
              href={`/anime/${anime.id}`}
              className="flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3 font-medium text-white shadow-glow transition-transform hover:scale-105"
            >
              <Play className="h-4 w-4 fill-white" /> View Details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
