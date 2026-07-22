"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Monitor } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface StreamSource {
  quality: string;
  url: string;
}

interface StreamData {
  master_m3u8: string;
  qualities: StreamSource[];
}

interface Props {
  slug: string;
  title: string;
  totalEps: number | null;
}

export function GogoAnimeWatchPlayer({ slug, title, totalEps }: Props) {
  const [currentEp, setCurrentEp] = useState(1);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      cleanupBlobUrl();
    };
  }, []);

  useEffect(() => {
    if (currentEp) {
      loadStream(slug, currentEp);
    }
  }, [slug, currentEp]);

  useEffect(() => {
    if (streamData?.master_m3u8 && videoRef.current) {
      loadMaster(streamData.master_m3u8);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamData]);

  function cleanupBlobUrl() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  const loadStream = useCallback(async (s: string, ep: number) => {
    setLoadingStream(true);
    setError(null);
    setStreamData(null);
    setSelectedQuality(0);
    cleanupBlobUrl();
    try {
      const res = await api.gogoanimeStream(s, ep);
      const data = res.data;
      if (data?.master_m3u8) {
        setStreamData(data);
      } else {
        setError("No streaming sources available for this episode");
      }
    } catch (err: any) {
      const msg = err?.status === 404
        ? "This episode is not available on GogoAnime"
        : "Failed to load streaming sources";
      setError(msg);
    } finally {
      setLoadingStream(false);
    }
  }, []);

  async function loadMaster(m3u8Content: string) {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    cleanupBlobUrl();

    const video = videoRef.current;
    if (!video) return;

    const Hls = (await import("hls.js")).default;

    const blob = new Blob([m3u8Content], { type: "application/vnd.apple.mpegurl" });
    const blobUrl = URL.createObjectURL(blob);
    blobUrlRef.current = blobUrl;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(blobUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        if (data.levels?.length > 1) {
          hls.currentLevel = 0;
        }
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          setError("Playback error: " + data.type);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = blobUrl;
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
