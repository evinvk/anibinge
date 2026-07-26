"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle, Magnet, Globe } from "lucide-react";
import { GogoAnimeWatchPlayer } from "@/components/gogoanime-watch-player";
import { WebTorrentPlayer } from "@/components/webtorrent-player";
import { EpisodeComments } from "@/components/episode-comments";
import clsx from "clsx";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function WatchPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const initialEp = parseInt(searchParams.get("ep") || "1", 10) || 1;
  const [title, setTitle] = useState<string | null>(null);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [anilistId, setAnilistId] = useState<number | null>(null);
  const [currentEp, setCurrentEp] = useState(initialEp);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"torrent" | "external">("torrent");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchInfo() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      let resolvedTitle: string | null = null;

      // 1. Get episode count directly from catalog by slug
      try {
        const res = await fetch(
          `${apiBase}/api/v1/streaming/gogoanime/${slug}/info`,
          { signal: AbortSignal.timeout(8000) }
        );
        const data = await res.json();
        if (data.data) {
          resolvedTitle = data.data.title;
          setTotalEps(data.data.episodes_count || null);
          if (resolvedTitle) setTitle(resolvedTitle);
        }
      } catch {
        // Not critical — fall through to search
      }

      // 2. Fallback: search by slug if info didn't work
      if (!resolvedTitle) {
        try {
          const res = await fetch(
            `${apiBase}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`,
            { signal: AbortSignal.timeout(12000) }
          );
          const data = await res.json();
          const match = data.data?.find((a: any) => a.slug === slug);
          if (match) {
            resolvedTitle = match.title;
            setTotalEps((prev) => prev ?? (match.episodes_count || match.actual_episodes_count || match.latest_episode || null));
          } else if (data.data?.length > 0) {
            resolvedTitle = data.data[0].title;
            setTotalEps((prev) => prev ?? (data.data[0].episodes_count || data.data[0].actual_episodes_count || data.data[0].latest_episode || null));
          } else {
            setError("Anime not found");
          }
          if (resolvedTitle) setTitle(resolvedTitle);
        } catch {
          setError("Failed to load anime info");
        }
      }

      // 3. Resolve AniList ID for Anivexa fallback
      try {
        const searchQ = resolvedTitle || slug.replace(/-/g, " ");
        const res = await fetch(
          `${apiBase}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(searchQ)}`
        );
        const data = await res.json();
        if (data.anilist_id) {
          setAnilistId(data.anilist_id);
        }
        if (data.episodes) {
          setTotalEps((prev) => prev ?? data.episodes);
        }
      } catch {
        // Not critical
      }

      setLoading(false);
    }
    fetchInfo();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !title) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-void">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-mist">{error || "Anime not found"}</p>
        <Link href="/" className="text-sm text-primary-400 hover:text-primary-300">
          Go back home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        {anilistId ? (
          <Link href={`/anime/${anilistId}`} className="mb-4 block font-display text-2xl font-bold text-paper hover:text-primary-400 transition-colors">{title}</Link>
        ) : (
          <h1 className="mb-4 font-display text-2xl font-bold text-paper">{title}</h1>
        )}

        {/* Source toggle */}
        <div className="mb-3 flex gap-1.5">
          <button
            onClick={() => setSource("torrent")}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              source === "torrent"
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <Magnet className="h-3.5 w-3.5" />
            Torrent (P2P)
          </button>
          <button
            onClick={() => setSource("external")}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              source === "external"
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            External
          </button>
        </div>

        {source === "torrent" ? (
          <WebTorrentPlayer
            title={title}
            episode={currentEp}
            onEpisodeChange={setCurrentEp}
          />
        ) : (
          <GogoAnimeWatchPlayer slug={slug} title={title} totalEps={totalEps} anilistId={anilistId} initialEp={initialEp} onEpisodeChange={setCurrentEp} />
        )}

        {title && (
          <EpisodeComments slug={slug} episodeNumber={currentEp} />
        )}
      </div>
    </div>
  );
}

export default function WatchPage({ params }: PageProps) {
  const { slug } = use(params);
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    }>
      <WatchPageInner slug={slug} />
    </Suspense>
  );
}
