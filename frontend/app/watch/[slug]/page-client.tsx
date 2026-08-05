"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { GogoAnimeWatchPlayer } from "@/components/gogoanime-watch-player";
import { EpisodeComments } from "@/components/episode-comments";
import { MonetagPopunder } from "@/components/monetag-popunder";
import { TopTen } from "@/components/top-ten";
import { useAuth } from "@/lib/auth-context";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function WatchPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const initialEp = parseInt(searchParams.get("ep") || "1", 10) || 1;
  const { user } = useAuth();
  const historyScope = user?.id ?? "guest";
  const [title, setTitle] = useState<string | null>(null);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [anilistId, setAnilistId] = useState<number | null>(null);
  const [currentEp, setCurrentEp] = useState(initialEp);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchInfo() {
      const apiBase = "";
      let resolvedTitle: string | null = null;

      // Step 1: Try GogoAnime info endpoint (often blocked from Vercel, so don't treat failure as fatal)
      try {
        const res = await fetch(`${apiBase}/api/v1/streaming/gogoanime/${slug}/info`, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (data.data) {
          resolvedTitle = data.data.title;
          setTotalEps(data.data.episodes_count || null);
          if (resolvedTitle) setTitle(resolvedTitle);
        }
      } catch {}

      // Step 2: Try GogoAnime search as fallback
      if (!resolvedTitle) {
        try {
          const res = await fetch(`${apiBase}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`, { signal: AbortSignal.timeout(12000) });
          const data = await res.json();
          const match = data.data?.find((a: any) => a.slug === slug);
          if (match) {
            resolvedTitle = match.title;
            setTotalEps((prev) => prev ?? (match.episodes_count || match.actual_episodes_count || match.latest_episode || null));
          } else if (data.data?.length > 0) {
            resolvedTitle = data.data[0].title;
            setTotalEps((prev) => prev ?? (data.data[0].episodes_count || data.data[0].actual_episodes_count || data.data[0].latest_episode || null));
          }
          if (resolvedTitle) setTitle(resolvedTitle);
        } catch {}
      }

      // Step 3: If GogoAnime failed, use the slug as a display title
      if (!resolvedTitle) {
        resolvedTitle = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        setTitle(resolvedTitle);
      }

      // Step 4: Resolve to AniList ID so Anivexa can serve the stream directly
      try {
        const res = await fetch(`${apiBase}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(resolvedTitle)}`);
        const data = await res.json();
        if (data.anilist_id) setAnilistId(data.anilist_id);
        if (data.episodes) setTotalEps((prev) => prev ?? data.episodes);
      } catch {}

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
      <MonetagPopunder />
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
        <GogoAnimeWatchPlayer slug={slug} title={title} totalEps={totalEps} anilistId={anilistId} initialEp={initialEp} onEpisodeChange={setCurrentEp} historyScope={historyScope} />

        <div className="mt-4 flex items-center justify-between gap-2">
          {currentEp > 1 ? (
            <Link
              href={`/watch/${slug}?ep=${currentEp - 1}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:text-paper"
            >
              <ArrowLeft className="h-4 w-4" />
              Episode {currentEp - 1}
            </Link>
          ) : <span />}
          {(!totalEps || currentEp < totalEps) ? (
            <Link
              href={`/watch/${slug}?ep=${currentEp + 1}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:text-paper"
            >
              Episode {currentEp + 1}
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </Link>
          ) : <span />}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            {title && (
              <EpisodeComments slug={slug} episodeNumber={currentEp} />
            )}
          </div>
          <aside className="min-w-0">
            <TopTen />
          </aside>
        </div>
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
