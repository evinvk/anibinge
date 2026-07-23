"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Monitor } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface StreamSource {
  quality: string;
  url: string;
}

interface Subtitle {
  file: string;
  label: string;
  language: string;
  kind: string;
  default: boolean;
  source: string;
}

interface StreamData {
  qualities: StreamSource[];
}

interface Props {
  slug: string;
  title: string;
  totalEps: number | null;
  anilistId?: number | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function GogoAnimeWatchPlayer({ slug, title, totalEps, anilistId }: Props) {
  const [currentEp, setCurrentEp] = useState(1);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"gogoanime" | "anivexa" | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const fallbackAttemptedRef = useRef(false);
  const currentEpRef = useRef(1);

  useEffect(() => {
    currentEpRef.current = currentEp;
  }, [currentEp]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (currentEp) {
      loadStream(slug, currentEp);
    }
  }, [slug, currentEp]);

  useEffect(() => {
    if (masterUrl && videoRef.current) {
      loadPlayer(masterUrl);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [masterUrl]);

  const loadAnivexaFallback = useCallback(async (ep: number) => {
    if (!anilistId) return false;
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anivexa/${anilistId}/stream?ep=${ep}`
      ).then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      });
      if (res && res.stream_url) {
        const proxiedSubs = (res.subtitles || []).map((s: Subtitle) => ({
          ...s,
          file: `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(s.file)}`,
        }));
        setSubtitles(proxiedSubs);
        const masterUrlFull = `${API_BASE}/api/v1/streaming/anivexa/${anilistId}/master?ep=${ep}`;
        setSource("anivexa");
        setMasterUrl(masterUrlFull);
        setStreamData({ qualities: [{ quality: "auto", url: masterUrlFull }] });
        setLoadingStream(false);
        return true;
      }
    } catch { /* fallback failed */ }
    return false;
  }, [anilistId]);

  const loadStream = useCallback(async (s: string, ep: number) => {
    setLoadingStream(true);
    setError(null);
    setStreamData(null);
    setMasterUrl(null);
    setSelectedQuality(0);
    setSubtitles([]);
    fallbackAttemptedRef.current = false;

    // Try GogoAnime first
    try {
      const res = await api.gogoanimeStream(s, ep);
      const data = res.data;
      if (data?.qualities) {
        setSource("gogoanime");
        setStreamData({ qualities: data.qualities });
        setMasterUrl(api.gogoanimeMaster(s, ep));
        setLoadingStream(false);
        return;
      }
    } catch {
      // GogoAnime failed
    }

    // GogoAnime unavailable, try Anivexa directly
    fallbackAttemptedRef.current = true;
    const ok = await loadAnivexaFallback(ep);
    if (!ok) {
      setError("No streaming sources available for this episode");
      setLoadingStream(false);
    }
  }, [title, anilistId, loadAnivexaFallback]);

  async function loadPlayer(url: string) {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    // Remove any existing subtitle tracks
    while (video.firstChild) {
      video.removeChild(video.firstChild);
    }

    const Hls = (await import("hls.js")).default;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        if (data.levels?.length > 1) {
          hls.currentLevel = 0;
        }
        // Add subtitle tracks from Anivexa
        if (subtitles.length > 0) {
          subtitles.forEach((sub) => {
            const track = document.createElement("track");
            track.kind = sub.kind || "captions";
            track.label = sub.label;
            track.srclang = sub.language;
            track.src = sub.file;
            if (sub.default) track.default = true;
            video.appendChild(track);
          });
        }
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, async (_: any, data: any) => {
        if (data.fatal && source === "gogoanime" && !fallbackAttemptedRef.current && anilistId) {
          fallbackAttemptedRef.current = true;
          hls.destroy();
          hlsRef.current = null;
          setLoadingStream(true);
          setError(null);
          const ok = await loadAnivexaFallback(currentEpRef.current);
          if (!ok) {
            setError("Streaming unavailable from all providers");
            setLoadingStream(false);
          }
        } else if (data.fatal) {
          setError("Playback error: " + data.type);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      // Add subtitle tracks for native HLS
      if (subtitles.length > 0) {
        subtitles.forEach((sub) => {
          const track = document.createElement("track");
          track.kind = sub.kind || "captions";
          track.label = sub.label;
          track.srclang = sub.language;
          track.src = sub.file;
          if (sub.default) track.default = true;
          video.appendChild(track);
        });
      }
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported in this browser");
    }
  }

  function setQuality(index: number) {
    setSelectedQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {loadingStream ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          </div>
        ) : streamData ? (
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

      {streamData && streamData.qualities.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {streamData.qualities.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuality(i)}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
                selectedQuality === i
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

      {error && !loadingStream && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </div>
  );
}
