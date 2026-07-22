"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, ChevronDown, Loader2, AlertTriangle, Monitor, Tv } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface Episode {
  id: number;
  number: number;
  title: string;
  snapshot: string | null;
  session: string;
}

interface Source {
  url: string;
  quality: string | null;
  fansub: string | null;
  audio: string | null;
}

interface AnimePahePlayerProps {
  animeTitle: string;
  animeSession: string;
}

export function AnimePahePlayer({ animeTitle, animeSession }: AnimePahePlayerProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEp, setSelectedEp] = useState<Episode | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [m3u8Url, setM3u8Url] = useState<string | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingM3u8, setLoadingM3u8] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    loadEpisodes();
  }, [animeSession]);

  useEffect(() => {
    if (m3u8Url && videoRef.current) {
      initPlayer(m3u8Url);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [m3u8Url]);

  async function loadEpisodes() {
    setLoadingEpisodes(true);
    setError(null);
    try {
      const res = await api.animepaheEpisodes(animeSession);
      setEpisodes(res.data || []);
    } catch {
      setError("Failed to load episodes");
    } finally {
      setLoadingEpisodes(false);
    }
  }

  async function selectEpisode(ep: Episode) {
    setSelectedEp(ep);
    setSelectedSource(null);
    setM3u8Url(null);
    setSources([]);
    setLoadingSources(true);
    setError(null);
    try {
      const res = await api.animepaheSources(animeSession, ep.session);
      setSources(res.data || []);
      if (res.data?.length > 0) {
        selectSource(res.data[0]);
      } else {
        setError("No streaming sources available for this episode");
      }
    } catch {
      setError("Failed to load streaming sources");
    } finally {
      setLoadingSources(false);
    }
  }

  async function selectSource(source: Source) {
    setSelectedSource(source);
    setM3u8Url(null);
    setLoadingM3u8(true);
    setError(null);
    try {
      const res = await api.animepaheM3u8(source.url);
      setM3u8Url(res.m3u8);
    } catch {
      setError("Failed to resolve streaming link");
    } finally {
      setLoadingM3u8(false);
    }
  }

  async function initPlayer(url: string) {
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
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    }
  }

  const groupedSources = sources.reduce<Record<string, Source[]>>((acc, s) => {
    const key = s.quality || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  if (loadingEpisodes) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading episodes...</span>
      </div>
    );
  }

  if (episodes.length === 0 && !error) {
    return null;
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Play className="h-5 w-5 text-primary-400" />
        <h2 className="font-display text-xl font-bold">Watch</h2>
        <span className="text-xs text-mist">via AnimePahe</span>
      </div>

      {/* Video Player */}
      {selectedSource && (
        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
          {loadingM3u8 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
            </div>
          ) : m3u8Url ? (
            <video
              ref={videoRef}
              className="h-full w-full"
              controls
              autoPlay
              playsInline
            />
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mist">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              <span className="text-sm">{error}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Source selector */}
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(groupedSources).map(([quality, srcs]) => (
            <div key={quality} className="flex items-center gap-1">
              <Monitor className="h-3 w-3 text-mist" />
              <span className="text-xs font-medium text-mist">{quality}</span>
              {srcs.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSource(s)}
                  className={clsx(
                    "rounded-md px-2 py-1 text-xs transition",
                    selectedSource?.url === s.url
                      ? "bg-primary-600 text-white"
                      : "bg-white/5 text-mist hover:bg-white/10"
                  )}
                >
                  {s.fansub || `Source ${i + 1}`}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Episode grid */}
      <div className="mt-4 max-h-64 overflow-y-auto rounded-xl bg-white/5 p-3">
        {loadingSources && (
          <div className="flex items-center justify-center gap-2 py-4 text-mist">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading sources...</span>
          </div>
        )}
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
          {episodes.map((ep) => (
            <button
              key={ep.id}
              onClick={() => selectEpisode(ep)}
              className={clsx(
                "rounded-lg py-1.5 text-xs font-medium transition",
                selectedEp?.id === ep.id
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              {ep.number}
            </button>
          ))}
        </div>
      </div>

      {/* Error display */}
      {error && !loadingSources && !loadingM3u8 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </section>
  );
}
