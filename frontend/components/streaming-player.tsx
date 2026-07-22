"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Monitor } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface SearchResult {
  slug: string;
  title: string;
  poster: string | null;
  episodes_count: number | null;
  score: string | null;
  type: string | null;
}

interface StreamSource {
  quality: string;
  url: string;
}

interface StreamingPlayerProps {
  animeTitle: string;
}

export function StreamingPlayer({ animeTitle }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<StreamSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    searchAnime();
  }, [animeTitle]);

  useEffect(() => {
    if (selectedSlug) {
      setCurrentEp(1);
      const match = results.find((r) => r.slug === selectedSlug);
      if (match?.episodes_count) {
        setTotalEps(match.episodes_count);
      }
    }
  }, [selectedSlug]);

  useEffect(() => {
    if (selectedSource?.url && videoRef.current) {
      initPlayer(selectedSource.url);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedSource]);

  const loadStream = useCallback(async (slug: string, ep: number) => {
    setLoadingStream(true);
    setError(null);
    setSources([]);
    setSelectedSource(null);
    try {
      const res = await api.gogoanimeStream(slug, ep);
      const streamSources = res.data || [];
      setSources(streamSources);
      if (streamSources.length > 0) {
        setSelectedSource(streamSources[0]);
      } else {
        setError("No streaming sources available for this episode");
      }
    } catch {
      setError("Failed to load streaming sources");
    } finally {
      setLoadingStream(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSlug && currentEp) {
      loadStream(selectedSlug, currentEp);
    }
  }, [selectedSlug, currentEp, loadStream]);

  async function searchAnime() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.gogoanimeSearch(animeTitle);
      setResults(res.data || []);
      if (res.data?.length > 0) {
        setSelectedSlug(res.data[0].slug);
        setTotalEps(res.data[0].episodes_count || null);
      }
    } catch {
      setError("Failed to search for streaming sources");
    } finally {
      setLoading(false);
    }
  }

  async function initPlayer(m3u8Url: string) {
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    const video = videoRef.current;
    if (!video) return;

    const Hls = (await import("hls.js")).default;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(m3u8Url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          setError("Playback error: " + data.type);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = m3u8Url;
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported in this browser");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Searching for streaming sources...</span>
      </div>
    );
  }

  if (error && results.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (results.length === 0 && !loading) {
    return null;
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Play className="h-5 w-5 text-primary-400" />
        <h2 className="font-display text-xl font-bold">Watch</h2>
      </div>

      {/* Server selector if multiple results */}
      {results.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {results.slice(0, 5).map((r) => (
            <button
              key={r.slug}
              onClick={() => setSelectedSlug(r.slug)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                selectedSlug === r.slug
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              {r.title}
            </button>
          ))}
        </div>
      )}

      {/* Video player */}
      <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
        {loadingStream ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          </div>
        ) : selectedSource ? (
          <video
            ref={videoRef}
            className="h-full w-full"
            controls
            playsInline
          />
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mist">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mist text-sm">
            Select an episode to start watching
          </div>
        )}
      </div>

      {/* Quality selector */}
      {sources.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((s, i) => (
            <button
              key={i}
              onClick={() => setSelectedSource(s)}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
                selectedSource?.url === s.url
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              <Monitor className="h-3 w-3" />
              {s.quality}
            </button>
          ))}
        </div>
      )}

      {/* Episode navigation */}
      {totalEps && totalEps > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setCurrentEp((p) => Math.max(1, p - 1))}
            disabled={currentEp <= 1}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp <= 1
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </button>
          <span className="text-sm font-mono text-mist">
            Ep {currentEp} / {totalEps}
          </span>
          <button
            onClick={() => setCurrentEp((p) => Math.min(totalEps, p + 1))}
            disabled={currentEp >= totalEps}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp >= totalEps
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Error display */}
      {error && !loadingStream && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </section>
  );
}
