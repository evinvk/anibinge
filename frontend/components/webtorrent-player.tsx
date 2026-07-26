"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, RotateCcw, Magnet } from "lucide-react";

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

export function WebTorrentPlayer({ title, episode }: Props) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const torrentRef = useRef<any>(null);
  const clientRef = useRef<any>(null);
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [searchEpisode, setSearchEpisode] = useState(episode || 1);
  const [statusText, setStatusText] = useState("");

  // Search Nyaa
  useEffect(() => {
    let cancelled = false;
    async function doSearch() {
      setLoading(true);
      setStreamError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/selfhosted/search?q=${encodeURIComponent(title)}&episode=${searchEpisode}&quality=720p`
        );
        const data = await res.json();
        if (!cancelled) {
          setResults(data.data || []);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
      if (!cancelled) setLoading(false);
    }
    doSearch();
    return () => { cancelled = true; };
  }, [title, searchEpisode]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (torrentRef.current) { try { torrentRef.current.destroy(); } catch {} }
      if (clientRef.current) { try { clientRef.current.destroy(); } catch {} }
    };
  }, []);

  const startStream = useCallback(async (torrentResult: TorrentResult) => {
    if (!torrentResult.magnet) return;
    setConnecting(true);
    setStreamError(null);
    setProgress(0);
    setSpeed(0);
    setStatusText("Initializing WebTorrent...");

    try {
      const WebTorrent = (await import("webtorrent")).default;
      if (!clientRef.current) {
        clientRef.current = new WebTorrent();
      }
      const client = clientRef.current;

      if (torrentRef.current) {
        try { torrentRef.current.destroy(); } catch {}
      }

      setStatusText("Connecting to peers...");
      const torrent = client.add(torrentResult.magnet, {
        strategy: "sequential",
        private: false,
        destroyStoreOnDestroy: true,
        store: undefined,
      });

      torrentRef.current = torrent;

      torrent.on("warning", (warn: Error) => {
        console.warn("[WebTorrent]", warn.message);
      });

      torrent.on("error", (err: Error) => {
        console.error("[WebTorrent]", err);
        setStreamError(`Torrent error: ${err.message}`);
        setConnecting(false);
        setStreaming(false);
      });

      torrent.on("download", () => {
        setProgress(Math.round(torrent.progress * 100));
        setSpeed(torrent.downloadSpeed);
        setStatusText("");
        setConnecting(false);
        if (!streaming) setStreaming(true);
      });

      torrent.on("done", () => {
        setProgress(100);
        setSpeed(0);
        setStatusText("Download complete");
      });

      torrent.on("ready", () => {
        const file = torrent.files.find((f: any) =>
          /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name)
        );
        if (!file) {
          setStreamError("No video file found in torrent");
          setConnecting(false);
          return;
        }

        setStatusText("Buffering...");

        if (playerContainerRef.current) {
          playerContainerRef.current.innerHTML = "";
          const video = document.createElement("video");
          video.className = "h-full w-full";
          video.controls = true;
          video.playsInline = true;
          video.autoplay = true;
          playerContainerRef.current.appendChild(video);
          file.renderTo(video, { autoplay: true, controls: true });
        }
      });

    } catch (err: any) {
      console.error("[WebTorrent init error]", err);
      setStreamError(err?.message || "Failed to start WebTorrent. Try External source instead.");
      setConnecting(false);
      setStreaming(false);
    }
  }, []);

  function handleStop() {
    if (torrentRef.current) { try { torrentRef.current.destroy(); } catch {}; torrentRef.current = null; }
    if (playerContainerRef.current) {
      playerContainerRef.current.innerHTML = "";
    }
    setStreaming(false);
    setConnecting(false);
    setProgress(0);
    setSpeed(0);
    setStatusText("");
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
        <span className="ml-2 text-sm text-mist">Searching torrents...</span>
      </div>
    );
  }

  // Connecting / streaming state
  if (connecting || streaming) {
    return (
      <div>
        <div ref={playerContainerRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-black" />
        {connecting && (
          <div className="mt-2 flex items-center gap-2 text-sm text-mist">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{statusText || "Connecting..."}</span>
            {progress > 0 && (
              <span className="text-xs text-mist/70">
                {progress}% · {formatBytes(speed)}/s
              </span>
            )}
          </div>
        )}
        {streaming && progress < 100 && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-mist/80">
              <span>Loading... {progress}%</span>
              <span>{formatBytes(speed)}/s</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-primary-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {streaming && (
          <button onClick={handleStop} className="mt-2 rounded-md bg-red-600/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-600/30 transition">
            Stop
          </button>
        )}
      </div>
    );
  }

  // Error state
  if (streamError) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white/5 py-8 text-mist">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <span className="text-sm text-center px-4">{streamError}</span>
          <button onClick={() => { setStreamError(null); setLoading(true); }}
            className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-500 transition">
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-mist">Other torrents:</p>
            <TorrentList results={results} onSelect={startStream} />
          </div>
        )}
      </div>
    );
  }

  // No results
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white/5 py-8">
        <Magnet className="h-6 w-6 text-mist/50" />
        <p className="text-sm text-mist">No torrents found on Nyaa</p>
        <p className="text-xs text-mist/60">Switch to External source below</p>
      </div>
    );
  }

  // Results list
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-paper">
          Torrent sources <span className="text-xs text-mist">(P2P stream)</span>
        </h3>
        <div className="flex items-center gap-2">
          {episode && (
            <div className="flex items-center gap-1">
              <button onClick={() => setSearchEpisode(Math.max(1, searchEpisode - 1))}
                className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-mist hover:bg-white/20">-</button>
              <span className="text-xs font-mono text-mist">Ep {searchEpisode}</span>
              <button onClick={() => setSearchEpisode(searchEpisode + 1)}
                className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-mist hover:bg-white/20">+</button>
            </div>
          )}
          <button onClick={() => setLoading(true)} className="text-xs text-primary-400 hover:text-primary-300">Refresh</button>
        </div>
      </div>
      <TorrentList results={results} onSelect={startStream} />
    </div>
  );
}

function TorrentList({ results, onSelect }: { results: TorrentResult[]; onSelect: (r: TorrentResult) => void }) {
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin">
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10 transition">
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-paper" title={r.title}>{r.title}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist/70">
              <span>{r.size_human}</span>
              <span className="text-green-400">S: {r.seeders}</span>
              <span className="text-red-400">L: {r.leechers}</span>
              {r.quality.map(q => (
                <span key={q} className="rounded bg-primary-600/20 px-1 py-0.5 text-primary-400">{q}</span>
              ))}
              {r.is_batch && <span className="rounded bg-amber-600/20 px-1 py-0.5 text-amber-400">BATCH</span>}
            </div>
          </div>
          <button onClick={() => onSelect(r)}
            className="shrink-0 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-500 transition">
            <Magnet className="mr-1 inline h-3 w-3" /> Stream
          </button>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
