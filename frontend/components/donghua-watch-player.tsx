"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Play, Server } from "lucide-react";
import { api, type DonghuaStreamData, type DonghuaServer } from "@/lib/api";
import { EpisodeComments } from "@/components/episode-comments";

interface Props {
  slug: string;
}

const EMBED_PATTERNS = [
  /ok\.ru\/(?:videoembed|video)\/\d+/,
  /dailymotion\.com/,
  /dai\.ly/,
];

function isEmbedUrl(url: string): boolean {
  return EMBED_PATTERNS.some((p) => p.test(url));
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
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    api.donghuaDetail(slug).then((r) => {
      setTitle(r.data.title);
      setTotalEps(r.data.episodes || r.data.episode_list?.length || null);
    }).catch(() => {});
  }, [slug]);

  const tryResolveEmbed = useCallback(async (url: string): Promise<string | null> => {
    try {
      const resp = await fetch(`/api/v1/streaming/donghua/resolve-embed?url=${encodeURIComponent(url)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.data?.stream_url || null;
    } catch {
      return null;
    }
  }, []);

  const fetchStream = useCallback(async (ep: number) => {
    setLoadingStream(true);
    setError(null);
    setServers([]);
    setStreamUrl(null);

    const allServers: DonghuaServer[] = [];

    try {
      const res = await api.donghuaStream(slug, ep);
      const s = res.data;
      if (s?.stream_url) {
        allServers.push({ label: "Direct", stream_url: s.stream_url });
      }
    } catch {}

    try {
      const res = await api.donghuaServers(slug, ep);
      const data = res.data;
      if (data.servers?.length) {
        allServers.push(...data.servers);
      }
    } catch {}

    if (allServers.length > 0) {
      setServers(allServers);
      setActiveServer(0);
      const first = allServers[0];
      if (isEmbedUrl(first.stream_url)) {
        setStreamUrl(first.stream_url);
        setResolving(true);
        const direct = await tryResolveEmbed(first.stream_url);
        if (direct) {
          setStreamUrl(direct);
        }
        setResolving(false);
      } else {
        setStreamUrl(first.stream_url);
      }
    } else {
      setError("No streaming sources found for this episode.");
    }
    setLoadingStream(false);
  }, [slug, tryResolveEmbed]);

  useEffect(() => {
    fetchStream(currentEp);
  }, [currentEp, fetchStream]);

  const handleServerChange = async (idx: number) => {
    if (!servers[idx]) return;
    setActiveServer(idx);
    const url = servers[idx].stream_url;
    if (isEmbedUrl(url)) {
      setStreamUrl(url);
      setResolving(true);
      const direct = await tryResolveEmbed(url);
      if (direct) {
        setStreamUrl(direct);
      }
      setResolving(false);
    } else {
      setStreamUrl(url);
    }
  };

  const goToEpisode = (ep: number) => {
    if (ep < 1) return;
    setCurrentEp(ep);
  };

  const resolvedUrl = (() => {
    if (!streamUrl) return null;
    if (streamUrl.startsWith("//")) return `https:${streamUrl}`;
    return streamUrl;
  })();

  const isDirectVideo = resolvedUrl ? /\.(m3u8|mp4|webm)(\?|$)/i.test(resolvedUrl) || resolvedUrl.includes("video-proxy") : false;
  const isHls = resolvedUrl ? /\.m3u8/i.test(resolvedUrl) : false;

  useEffect(() => {
    if (!resolvedUrl || !isHls || !videoRef.current) return;
    let hls: any;
    import("hls.js").then((Hls) => {
      if (Hls.default.isSupported()) {
        hls = new Hls.default();
        hls.loadSource(resolvedUrl);
        hls.attachMedia(videoRef.current!);
      }
    });
    return () => { if (hls) hls.destroy(); };
  }, [resolvedUrl, isHls]);

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
          ) : resolving ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
              <p className="text-sm text-mist">Resolving video source...</p>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-mist">{error}</p>
            </div>
          ) : isDirectVideo && resolvedUrl ? (
            <video
              ref={videoRef}
              key={resolvedUrl}
              className="absolute inset-0 h-full w-full"
              controls
              autoPlay
              playsInline
              src={!isHls ? resolvedUrl : undefined}
            >
              <p>Your browser does not support HTML video.</p>
            </video>
          ) : resolvedUrl ? (
            <div className="absolute inset-0 flex flex-col">
              <iframe
                key={resolvedUrl}
                src={resolvedUrl}
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
              />
              <div className="flex items-center justify-center gap-2 bg-void/90 px-3 py-1.5 text-xs text-mist">
                <span>Embed blocked? Try opening directly:</span>
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-red-500 px-2.5 py-1 text-white hover:bg-red-400 transition-colors"
                >
                  Open video
                </a>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-mist">No stream available</p>
            </div>
          )}
        </div>

        {/* Server selector */}
        {servers.length > 1 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-mist" />
              <span className="text-sm font-medium text-mist">Select source</span>
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

        {title && (
          <EpisodeComments slug={slug} episodeNumber={currentEp} />
        )}
      </div>
    </div>
  );
}
