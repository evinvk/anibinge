"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, ChevronDown, Loader2, AlertTriangle, Monitor, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useSubtitles } from "@/hooks/use-subtitles";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import clsx from "clsx";

interface SearchResult {
  slug: string;
  title: string;
  poster: string | null;
  episodes_count: number | null;
  score: string | null;
  type: string | null;
}

interface StreamingPlayerProps {
  animeTitle: string;
  anilistId?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FRIENDLY_ERRORS: Record<string, string> = {
  networkError: "Streaming source is temporarily unavailable",
  mediaError: "Video format not supported by this source",
  sourceError: "Source format not supported",
  hlsError: "Unable to load video stream",
};

function friendlyError(raw: string): string {
  if (raw.startsWith("Playback error: ")) {
    const code = raw.slice("Playback error: ".length);
    return FRIENDLY_ERRORS[code] || "Streaming is temporarily unavailable";
  }
  return raw;
}

export function StreamingPlayer({ animeTitle, anilistId }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const embedUrlRef = useRef<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  const subs = useSubtitles(videoRef);
  const currentEpRef = useRef(1);
  currentEpRef.current = currentEp;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsTargetRef = useRef<Element | null>(null);

  const tryAnivexa = useCallback(async (ep: number): Promise<boolean> => {
    let aid = resolvedAnilistRef.current;
    if (!aid) {
      setStatusText("Resolving anime...");
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(animeTitle)}`
        ).then(r => r.json());
        if (res.anilist_id) {
          aid = res.anilist_id;
          resolvedAnilistRef.current = aid;
        }
      } catch { /* not critical */ }
    }
    if (!aid) return false;
    setStatusText("Loading stream...");
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}`
      ).then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      });
      if (res && (res.stream_url || res.embed_url)) {
        if (res.embed_url) {
          setEmbedUrl(res.embed_url);
          embedUrlRef.current = res.embed_url;
        }
        if (!res.stream_url) {
          player.setLoadingStream(false);
          player.setStreamData(null);
          player.setMasterUrl(null);
          setStatusText("");
          return false;
        }
        subs.setSubs((res.subtitles || []).map((s: any) => {
          const proxySubUrl = `/api/proxy?url=${encodeURIComponent(s.file)}&referer=${encodeURIComponent(s.referer || "")}`;
          return { ...s, file: proxySubUrl };
        }));
        const hlsUrl = `/api/proxy?url=${encodeURIComponent(res.stream_url)}&referer=${encodeURIComponent(res.referer || "")}`;
        player.sourceRef.current = "anivexa";

        let qualities = [{ quality: "Auto", url: hlsUrl }];
        try {
          const m3u8Resp = await fetch(hlsUrl);
          if (m3u8Resp.ok) {
            const m3u8Text = await m3u8Resp.text();
            const parsed: { quality: string; url: string }[] = [];
            const lines = m3u8Text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line.startsWith("#EXT-X-STREAM-INF:")) {
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);
                const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : null;
                if (bwMatch && nextLine && !nextLine.startsWith("#")) {
                  const bw = parseInt(bwMatch[1]);
                  let label = bw >= 5000000 ? "1080p" : bw >= 2500000 ? "720p" : bw >= 1000000 ? "480p" : "360p";
                  if (resMatch) label += ` (${resMatch[1]})`;
                  const variantUrl = nextLine.startsWith("http")
                    ? `/api/proxy?url=${encodeURIComponent(nextLine)}&referer=${encodeURIComponent(res.referer || "")}`
                    : nextLine.startsWith("/") ? nextLine : hlsUrl;
                  parsed.push({ quality: label, url: variantUrl });
                }
              }
            }
            if (parsed.length > 1) qualities = parsed;
          }
        } catch { /* keep auto */ }

        player.setMasterUrl(hlsUrl);
        player.setStreamData({ qualities });
        player.setLoadingStream(false);
        setStatusText("");
        return true;
      }
    } catch { /* fallback failed */ }
    setStatusText("");
    return false;
  }, [animeTitle]);

  const onFatalError = useCallback(async (errorType: string) => {
    console.error("[onFatalError]", { errorType, source: player.sourceRef.current });
    if (player.sourceRef.current === "gogoanime") {
      player.sourceRef.current = null;
      player.destroyHls();
      player.setLoadingStream(true);
      player.setStreamData(null);
      player.setMasterUrl(null);
      player.setError(null);
      player.setPlayerStatus("idle");
      setStatusText("Trying Anivexa...");
      const ok = await tryAnivexa(currentEpRef.current);
      if (!ok) {
        player.setError(friendlyError("Playback error: " + errorType));
        player.setLoadingStream(false);
        setStatusText("");
      }
    } else {
      player.setError(friendlyError("Playback error: " + errorType));
      player.setLoadingStream(false);
      setStatusText("");
    }
  }, [tryAnivexa]);

  const player = useHlsPlayer(videoRef, subs.loadSubtitles, onFatalError);

  useEffect(() => {
    searchAnime();
    return () => player.destroyHls();
  }, [animeTitle]);

  useEffect(() => {
    const onFsChange = () => {
      const el = document.fullscreenElement;
      setIsFullscreen(!!el);
      fsTargetRef.current = el;
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

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
    if (player.masterUrl && videoRef.current) {
      player.loadPlayer(player.masterUrl);
    }
    return () => player.destroyHls();
  }, [player.masterUrl]);

  useEffect(() => {
    if (subs.subtitles.length > 0 && videoRef.current) {
      subs.loadSubtitles();
    }
  }, [subs.subtitles]);

  const loadStream = useCallback(async (slug: string, ep: number) => {
    player.setLoadingStream(true);
    player.setError(null);
    subs.resetSubs();
    player.destroyHls();
    player.setStreamData(null);
    player.setMasterUrl(null);
    setEmbedUrl(null);
    embedUrlRef.current = null;
    player.fallbackAttemptedRef.current = false;
    player.sourceRef.current = null;
    player.setPlayerStatus("idle");

    setStatusText("Trying primary source...");
    const ok = await tryAnivexa(ep);
    if (ok) return;

    setStatusText("Trying alternate source...");
    const streamRes = await api.gogoanimeStream(slug, ep).catch(() => null);
    const data = streamRes?.data;
    if (data?.qualities) {
      player.sourceRef.current = "gogoanime";
      player.setStreamData({ qualities: data.qualities });
      player.setMasterUrl(api.gogoanimeMaster(slug, ep));
      player.setLoadingStream(false);
      setStatusText("");
      return;
    }

    player.setLoadingStream(false);
    setStatusText("");
    if (!embedUrlRef.current) {
      player.setError("Streaming is temporarily unavailable. Try again later.");
    }
  }, [tryAnivexa, animeTitle]);

  useEffect(() => {
    if (selectedSlug && currentEp) {
      loadStream(selectedSlug, currentEp);
    }
  }, [selectedSlug, currentEp, loadStream]);

  async function searchAnime() {
    player.setLoadingStream(true);
    player.setError(null);
    setStatusText("Searching for streaming sources...");
    try {
      const res = await api.gogoanimeSearch(animeTitle);
      setResults(res.data || []);
      if (res.data?.length > 0) {
        setSelectedSlug(res.data[0].slug);
        const epCount = res.data[0].episodes_count || res.data[0].actual_episodes_count || res.data[0].latest_episode || null;
        setTotalEps(epCount);
      } else {
        player.setError("This anime is not available for streaming");
      }
    } catch {
      player.setError("Failed to search for streaming sources");
    } finally {
      player.setLoadingStream(false);
      setStatusText("");
    }

    if (!resolvedAnilistRef.current) {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(animeTitle)}`
        ).then(r => r.json());
        if (res.anilist_id) {
          resolvedAnilistRef.current = res.anilist_id;
        }
      } catch { /* not critical */ }
    }

    if (!totalEps && resolvedAnilistRef.current) {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/streaming/anivexa/${resolvedAnilistRef.current}/episodes`
        ).then(r => r.json());
        const count = res?.mappings?.episodes;
        if (count && count > 0) {
          setTotalEps(count);
        }
      } catch { /* not critical */ }
    }
  }

  const handleRetry = useCallback(() => {
    player.resetPlayer();
    setEmbedUrl(null);
    embedUrlRef.current = null;
    if (selectedSlug) {
      loadStream(selectedSlug, currentEp);
    }
  }, [selectedSlug, currentEp, loadStream]);

  if (player.loadingStream && !player.streamData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{statusText || "Searching for streaming sources..."}</span>
      </div>
    );
  }

  if (player.error && results.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs flex-1">{player.error}</span>
        <button onClick={handleRetry} className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30 transition">
          Retry
        </button>
      </div>
    );
  }

  if (results.length === 0 && !player.loadingStream) {
    return null;
  }

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <Play className="h-5 w-5 text-primary-400" />
        <h2 className="font-display text-xl font-bold">Watch</h2>
      </div>

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

      <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
        {player.loadingStream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
            {statusText && (
              <span className="text-xs text-mist">{statusText}</span>
            )}
          </div>
        ) : player.streamData ? (
          <>
            <video ref={videoRef} className="h-full w-full" controls playsInline />
            {player.playerStatus === "buffering" && !player.error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-full bg-black/50 p-3">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              </div>
            )}
            {subs.activeCues.length > 0 && (
              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-0.5 px-4 pointer-events-none">
                {subs.activeCues.map((text, i) => (
                  <span
                    key={i}
                    className="rounded bg-black/70 px-2 py-0.5 text-center text-sm font-medium text-white shadow-lg sm:text-base"
                  >
                    {text}
                  </span>
                ))}
              </div>
            )}
            {subs.activeCues.length > 0 && isFullscreen && fsTargetRef.current && createPortal(
              <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-0.5 px-4 pointer-events-none z-50">
                {subs.activeCues.map((text, i) => (
                  <span
                    key={i}
                    className="rounded bg-black/70 px-3 py-1 text-center text-base font-medium text-white shadow-lg md:text-lg"
                  >
                    {text}
                  </span>
                ))}
              </div>,
              fsTargetRef.current
            )}
          </>
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            className="h-full w-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : player.error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-mist">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span className="text-sm text-center px-4 max-w-xs">{friendlyError(player.error)}</span>
            <button
              onClick={handleRetry}
              className="mt-1 flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mist text-sm">
            Select an episode to start watching
          </div>
        )}
      </div>

      {subs.subtitles.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {subs.subtitles.map((sub, i) => (
            <button
              key={i}
              onClick={() => subs.switchSub(i)}
              className={clsx(
                "rounded-md px-2 py-1 text-xs font-medium transition",
                subs.selectedSub === i
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              {sub.label}
            </button>
          ))}
          <button
            onClick={() => { subs.setSelectedSub(-1); subs.cuesRef.current = []; subs.setActiveCues([]); }}
            className={clsx(
              "rounded-md px-2 py-1 text-xs font-medium transition",
              subs.selectedSub === -1 || (subs.subtitles.length > 0 && subs.cuesRef.current.length === 0 && subs.selectedSub === 0 && !subs.subtitles[0]?.default)
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            Off
          </button>
        </div>
      )}

      {player.streamData && (() => {
        const hls = player.hlsRef.current;
        const levels = hls?.levels;
        if (!levels || levels.length < 2) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => player.setQuality(-1)}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
                player.selectedQuality === -1
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              <Monitor className="h-3 w-3" />
              Auto
            </button>
            {levels.map((level: any, i: number) => {
              const label = level.height ? `${level.height}p` : level.bitrate ? `${Math.round(level.bitrate / 1000)}kbps` : `Level ${i}`;
              return (
                <button
                  key={i}
                  onClick={() => player.setQuality(i)}
                  className={clsx(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
                    player.selectedQuality === i
                      ? "bg-primary-600 text-white"
                      : "bg-white/5 text-mist hover:bg-white/10"
                  )}
                >
                  <Monitor className="h-3 w-3" />
                  {label}
                </button>
              );
            })}
          </div>
        );
      })()}

      {totalEps && totalEps > 1 && (
        <div className="mt-3">
          <button
            onClick={() => setShowEpisodes((p) => !p)}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-mist transition hover:bg-white/10"
          >
            Episode {currentEp} / {totalEps}
            <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", showEpisodes && "rotate-180")} />
          </button>

          {showEpisodes && (
            <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-void/80 p-2 scrollbar-thin">
              {Array.from({ length: totalEps }, (_, i) => i + 1).map((ep) => (
                <button
                  key={ep}
                  onClick={() => {
                    setCurrentEp(ep);
                    setShowEpisodes(false);
                  }}
                  className={clsx(
                    "flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-xs font-mono font-medium transition",
                    ep === currentEp
                      ? "bg-primary-600 text-white"
                      : "bg-white/5 text-mist hover:bg-white/10"
                  )}
                >
                  {ep}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {player.error && !player.loadingStream && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs flex-1">{friendlyError(player.error)}</span>
          <button onClick={handleRetry} className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30 transition">
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
