"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, RotateCcw, Download, Magnet } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface TorrentResult {
  title: string;
  magnet: string;
  size_bytes: number;
  size_human: string;
  seeders: number;
  leechers: number;
  quality: string[];
  episode: number | null;
  is_batch: boolean;
  date: string | null;
}

interface Props {
  title: string;
  episode?: number;
  onEpisodeChange?: (ep: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function WebTorrentPlayer({ title, episode, onEpisodeChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const torrentRef = useRef<any>(null);
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [searchEpisode, setSearchEpisode] = useState(episode || 1);
  const webtorrentRef = useRef<any>(null);

  // Search Nyaa on mount / title change
  useEffect(() => {
    let cancelled = false;
    async function doSearch() {
      setLoading(true);
      setStreamError(null);
      try {
        const ep = searchEpisode;
        const res = await fetch(
          `${API_BASE}/api/v1/selfhosted/search?q=${encodeURIComponent(title)}&episode=${ep}&quality=720p`
        );
        const data = await res.json();
        if (!cancelled) {
          setResults(data.data || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
        }
      }
    }
    doSearch();
    return () => { cancelled = true; };
  }, [title, searchEpisode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (torrentRef.current) {
        try { torrentRef.current.destroy(); } catch {}
      }
    };
  }, []);

  const startStream = useCallback(async (torrentResult: TorrentResult) => {
    if (!torrentResult.magnet) return;

    setStreaming(true);
    setStreamError(null);
    setProgress(0);
    setSelectedMagnet(torrentResult.magnet);

    try {
      const WebTorrent = (await import("webtorrent")).default;
      if (!webtorrentRef.current) {
        webtorrentRef.current = new WebTorrent();
      }
      const client = webtorrentRef.current;

      // Destroy any existing torrent
      if (torrentRef.current) {
        try { torrentRef.current.destroy(); } catch {}
      }

      const torrent = client.add(torrentResult.magnet, {
        path: undefined, // in-memory, no disk storage
        strategy: "sequential",
      });

      torrentRef.current = torrent;

      torrent.on("download", () => {
        setProgress(Math.round(torrent.progress * 100));
        setSpeed(torrent.downloadSpeed);
      });

      torrent.on("done", () => {
        setProgress(100);
        setSpeed(0);
      });

      torrent.on("error", (err: Error) => {
        setStreamError(`Torrent error: ${err.message}`);
        setStreaming(false);
      });

      // Find the largest video file
      const file = torrent.files.find((f: any) =>
        /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name)
      );

      if (!file) {
        setStreamError("No video file found in torrent");
        setStreaming(false);
        return;
      }

      // Stream to video element
      file.renderTo(videoRef.current!, {
        autoplay: true,
        controls: true,
      });
    } catch (err: any) {
      setStreamError(err?.message || "Failed to start WebTorrent stream");
      setStreaming(false);
    }
  }, []);

  function handleStopStream() {
    if (torrentRef.current) {
      try { torrentRef.current.destroy(); } catch {}
      torrentRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setStreaming(false);
    setProgress(0);
    setSpeed(0);
    setSelectedMagnet(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
        <span className="ml-2 text-sm text-mist">Searching torrents...</span>
      </div>
    );
  }

  if (streaming) {
    return (
      <div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="h-full w-full" controls playsInline />
          {progress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <div className="flex items-center justify-between text-xs text-white/80">
                <span>Downloading... {progress}%</span>
                <span>{formatBytes(speed)}/s</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleStopStream}
            className="rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30 transition"
          >
            Stop
          </button>
        </div>
      </div>
    );
  }

  if (streamError) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white/5 py-8 text-mist">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <span className="text-sm">{streamError}</span>
          <button
            onClick={() => { setStreamError(null); setLoading(true); }}
            className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 transition"
          >
            <RotateCcw className="h-3 w-3" />
            Try again
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-3">
            <h4 className="mb-2 text-xs font-medium text-mist">Other torrents:</h4>
            <TorrentList
              results={results}
              onSelect={startStream}
              loading={downloading}
            />
          </div>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white/5 py-8">
        <Magnet className="h-6 w-6 text-mist/50" />
        <p className="text-sm text-mist">No torrents found on Nyaa</p>
        <p className="text-xs text-mist/60">Fallback to external sources below</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-paper">
          Torrent sources <span className="text-xs text-mist">(streamed P2P)</span>
        </h3>
        <div className="flex items-center gap-2">
          {episode && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSearchEpisode(Math.max(1, searchEpisode - 1))}
                className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-mist hover:bg-white/20"
              >
                -
              </button>
              <span className="text-xs font-mono text-mist">Ep {searchEpisode}</span>
              <button
                onClick={() => setSearchEpisode(searchEpisode + 1)}
                className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-mist hover:bg-white/20"
              >
                +
              </button>
            </div>
          )}
          <button
            onClick={() => setLoading(true)}
            className="text-xs text-primary-400 hover:text-primary-300"
          >
            Refresh
          </button>
        </div>
      </div>
      <TorrentList
        results={results}
        onSelect={startStream}
        loading={downloading}
      />
    </div>
  );
}

function TorrentList({
  results,
  onSelect,
  loading,
}: {
  results: TorrentResult[];
  onSelect: (r: TorrentResult) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
      {results.map((r, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10 transition"
        >
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-paper" title={r.title}>
              {r.title}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist/70">
              <span>{r.size_human}</span>
              <span className="text-green-400">S: {r.seeders}</span>
              <span className="text-red-400">L: {r.leechers}</span>
              {r.quality.map((q) => (
                <span key={q} className="rounded bg-primary-600/20 px-1 py-0.5 text-primary-400">
                  {q}
                </span>
              ))}
              {r.is_batch && (
                <span className="rounded bg-amber-600/20 px-1 py-0.5 text-amber-400">
                  BATCH
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onSelect(r)}
            disabled={loading}
            className="shrink-0 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-500 transition disabled:opacity-50"
          >
            <Magnet className="mr-1 inline h-3 w-3" />
            Stream
          </button>
        </div>
      ))}
    </div>
  );
}
