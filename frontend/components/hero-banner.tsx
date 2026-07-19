"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Plus } from "lucide-react";
import type { AnimeSummary } from "@/lib/api";

export function HeroBanner({ anime }: { anime: AnimeSummary }) {
  return (
    <section className="relative h-[70vh] min-h-[480px] w-full overflow-hidden">
      {anime.banner || anime.image ? (
        <Image
          src={anime.banner || anime.image!}
          alt={anime.title_english || anime.title}
          fill
          priority
          className="object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/70 to-void/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-void/90 via-void/20 to-transparent" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-2xl"
        >
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
            <button className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-medium text-white backdrop-blur-md transition-colors hover:bg-white/10">
              <Plus className="h-4 w-4" /> Add to Watchlist
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
