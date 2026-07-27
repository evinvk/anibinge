"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Play, Server } from "lucide-react";
import { api, type DonghuaStreamData, type DonghuaServer } from "@/lib/api";

interface Props {
  slug: string;
}

export default function DonghuaWatchPage({ slug }: Props) {
  const searchParams = useSearchParams();
  const initialEp = parseInt(searchParams.get("ep") || "1", 10) || 1;

  const [title, setTitle] = useState<string>("");
  const [currentEp, setCurrentEp] = useState(initialEp);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [servers, setServers] = useState<DonghuaServer[]>([]);
  const [activeServer, setActiveServer] = useState(0);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Fetch anime detail for title + episode count
  useEffect(() => {
    api.donghuaDetail(slug).then((r) => {
      setTitle(r.data.title);
      setTotalEps(r.data.episodes || r.data.episode_list?.length || null);
    }).catch(() => {});
  }, [slug]);

  // Fetch servers + stream when episode or server changes
  const fetchStream = useCallback(async (ep: number, serverIdx: number) => {
    setLoadingStream(true);
    setError(null);
    try {
      const res = await api.donghuaServers(slug, ep);
      const data = res.data;
      setServers(data.servers || []);
      setPrevUrl(data.prev_url || null);
      setNextUrl(data.next_url || null);

      if (data.servers && data.servers.length > 0) {
        const idx = Math.min(serverIdx, data.servers.length - 1);
        setActiveServer(idx);
        setStreamUrl(data.servers[idx].stream_url);
      } else {
        setError("No streaming servers found for this episode.");
      }
    } catch {
      setError("Failed to load streaming servers.");
    }
    setLoadingStream(false);
  }, [slug]);

  useEffect(() => {
    fetchStream(currentEp, 0);
  }, [currentEp, fetchStream]);

  const handleServerChange = (idx: number) => {
    if (servers[idx]) {
      setActiveServer(idx);
      setStreamUrl(servers[idx].stream_url);
    }
  };

  const goToEpisode = (ep: number) => {
    if (ep < 1) return;
    setCurrentEp(ep);
  };

  const proxyUrl = streamUrl ? api.donghuaProxy(streamUrl, "https://animexin.dev/") : null;

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <Link
          href={`/donghua/${slug}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {title || "Back"}
        </Link>

        {title && (
          <Link href={`/donghua/${slug}`} className="mb-4 block font-display text-2xl font-bold text-paper hover:text-red-400 transition-colors">
            {title}
          </Link>
        )}

        {/* Player */}
        <div className="relative w-full overflow-hidden rounded-xl2 bg-black" style={{ aspectRatio: "16/9" }}>
          {loadingStream ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-mist">{error}</p>
            </div>
          ) : proxyUrl ? (
            <iframe
              key={`${currentEp}-${activeServer}`}
              src={proxyUrl}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              frameBorder={0}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-mist">No stream available</p>
            </div>
          )}
        </div>

        {/* Server selector */}
        {servers.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-mist" />
              <span className="text-sm font-medium text-mist">Server</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {servers.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleServerChange(i)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    i === activeServer
                      ? "bg-red-500 text-white"
                      : "bg-white/5 text-mist border border-white/10 hover:border-red-400/30 hover:text-paper"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Episode navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => goToEpisode(currentEp - 1)}
            disabled={currentEp <= 1}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition-all hover:border-red-400/30 hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-mist">Episode</span>
            <input
              type="number"
              min={1}
              max={totalEps || 9999}
              value={currentEp}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) goToEpisode(v);
              }}
              className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-sm text-paper"
            />
            {totalEps && <span className="text-sm text-mist">/ {totalEps}</span>}
          </div>

          <button
            onClick={() => goToEpisode(currentEp + 1)}
            disabled={totalEps ? currentEp >= totalEps : false}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition-all hover:border-red-400/30 hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Quick episode grid */}
        {totalEps && totalEps <= 200 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-mist">Episodes</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: Math.min(totalEps, 200) }, (_, i) => i + 1).map((ep) => (
                <button
                  key={ep}
                  onClick={() => goToEpisode(ep)}
                  className={`h-8 w-10 rounded-md text-xs font-medium transition-all ${
                    ep === currentEp
                      ? "bg-red-500 text-white"
                      : "bg-white/5 text-mist hover:bg-white/10 hover:text-paper"
                  }`}
                >
                  {ep}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
