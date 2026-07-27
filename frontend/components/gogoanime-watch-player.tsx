"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Loader2, AlertTriangle, Monitor, Play, RotateCcw, Download, Maximize2, Minimize2, RectangleHorizontal, Shrink } from "lucide-react";
import { api } from "@/lib/api";
import { useSubtitles } from "@/hooks/use-subtitles";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import clsx from "clsx";

interface StreamSource {
  quality: string;
  url: string;
}

interface StreamData {
  qualities: StreamSource[];
}

interface Props {
  slug: string;
  title: string;
  totalEps: number | null;
  anilistId?: number | null;
  initialEp?: number;
  onEpisodeChange?: (ep: number) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function proxySubUrl(file: string, referer: string) {
  return `/api/proxy?url=${encodeURIComponent(file)}&referer=${encodeURIComponent(referer || "")}`;
}

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

export function GogoAnimeWatchPlayer({ slug, title, totalEps, anilistId, initialEp = 1, onEpisodeChange }: Props) {
  const [currentEp, setCurrentEp] = useState(initialEp);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const currentEpRef = useRef(initialEp);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [audio, setAudio] = useState<"sub" | "dub">("sub");

  const [statusText, setStatusText] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [nextEpCountdown, setNextEpCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subs = useSubtitles(videoRef);

  const tryGogoanime = useCallback(async (ep: number, epAudio: string = audio): Promise<boolean> => {
    setStatusText("");
    try {
      const streamRes = await api.gogoanimeStream(slug, ep, epAudio).catch(() => null);
      const data = streamRes?.data;

      if (data?.direct_stream?.stream_url) {
        subs.setSubs([]);
        player.sourceRef.current = "gogoanime";
        const proxiedUrl = api.gogoanimeEmbedProxy(data.direct_stream.stream_url, data.direct_stream.referer);
        player.setStreamData({ qualities: [{ quality: "Auto", url: proxiedUrl }] });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        setStatusText("");
        fetchSubtitlesInBackground(ep);
        return true;
      }
      if (data?.qualities) {
        subs.setSubs([]);
        player.sourceRef.current = "gogoanime";
        player.setStreamData({ qualities: data.qualities });
        player.setMasterUrl(api.gogoanimeMaster(slug, ep, epAudio));
        player.setLoadingStream(false);
        setStatusText("");
        fetchSubtitlesInBackground(ep);
        return true;
      }
    } catch { }
    setStatusText("");
    return false;
  }, [slug, audio]);

  const tryAnitsu = useCallback(async (ep: number, epAudio: string = audio): Promise<boolean> => {
    setStatusText("");
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anitsu/stream?q=${encodeURIComponent(title)}&ep=${ep}&audio=${epAudio}`
      ).then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      });
      if (res && res.stream_url) {
        subs.setSubs((res.subtitles || []).map((s: any) => ({
          ...s,
          file: proxySubUrl(s.file, s.referer),
        })));
        player.sourceRef.current = "anitsu";

        if (res.stream_type === "mp4") {
          const mp4Url = `/api/proxy?url=${encodeURIComponent(res.stream_url)}&referer=${encodeURIComponent(res.referer || "")}`;
          player.setStreamData({ qualities: [{ quality: "Auto", url: mp4Url }] });
          player.setLoadingStream(false);
          setStatusText("");
          await new Promise(r => setTimeout(r, 100));
          if (videoRef.current) {
            videoRef.current.src = mp4Url;
            videoRef.current.play().catch(() => {});
          }
          return true;
        }

        const hlsUrl = `/api/proxy?url=${encodeURIComponent(res.stream_url)}&referer=${encodeURIComponent(res.referer || "")}`;
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
        } catch { }

        player.setMasterUrl(hlsUrl);
        player.setStreamData({ qualities });
        player.setLoadingStream(false);
        setStatusText("");
        return true;
      }
    } catch { }
    setStatusText("");
    return false;
  }, [title]);

  const fetchSubtitlesInBackground = useCallback((ep: number) => {
    const fetchEp = currentEpRef.current;
    api.fetchSubtitles(title, fetchEp, resolvedAnilistRef.current || undefined)
      .then((subRes) => {
        if (subRes.subtitles?.length > 0 && subs.subtitles.length === 0 && fetchEp === currentEpRef.current) {
          subs.setSubs(subRes.subtitles.map((s: any) => ({
            ...s,
            file: `/api/proxy?url=${encodeURIComponent(s.file)}&referer=${encodeURIComponent(s.referer || "")}`,
          })));
          subs.loadSubtitles();
        }
      })
      .catch(() => {});
  }, [title, subs]);

  const fallbackAttemptedRef = useRef(false);

  const onFatalError = useCallback(async (errorType: string) => {
    if (fallbackAttemptedRef.current) {
      player.setError(friendlyError("Playback error: " + errorType));
      player.setLoadingStream(false);
      setStatusText("");
      return;
    }
    fallbackAttemptedRef.current = true;
    player.destroyHls();
    player.setLoadingStream(true);
    player.setStreamData(null);
    player.setMasterUrl(null);
    player.setError(null);

    const currentSource = player.sourceRef.current;
    if (currentSource === "gogoanime") {
      const ok = await tryAnitsu(currentEpRef.current);
      if (!ok) {
        player.setError(friendlyError("Playback error: " + errorType));
        player.setLoadingStream(false);
        setStatusText("");
      }
    } else {
      // Fallback from any other source: try gogoanime
      const ok = await tryGogoanime(currentEpRef.current);
      if (!ok) {
        player.setError(friendlyError("Playback error: " + errorType));
        player.setLoadingStream(false);
        setStatusText("");
      }
    }
  }, [tryGogoanime, tryAnitsu]);

  const onMediaEnded = useCallback(() => {
    if (!autoPlay) return;
    const next = currentEpRef.current + 1;
    if (totalEps && next > totalEps) return;
    setNextEpCountdown(5);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setNextEpCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          const newEp = currentEpRef.current + 1;
          setCurrentEp(newEp);
          if (onEpisodeChangeRef.current) onEpisodeChangeRef.current(newEp);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [autoPlay, totalEps]);

  const onAfterLoad = useCallback(() => {
    if (subs.subtitles.length > 0) {
      subs.loadSubtitles();
    }
  }, [subs]);

  const player = useHlsPlayer(videoRef, onAfterLoad, onFatalError, onMediaEnded);

  useEffect(() => {
    currentEpRef.current = currentEp;
  }, [currentEp]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    return () => player.destroyHls();
  }, [title]);

  useEffect(() => {
    if (currentEp) {
      loadStream(slug, currentEp);
    }
  }, [slug, currentEp, audio]);

  useEffect(() => {
    if (!resolvedAnilistRef.current && title) {
      fetch(`${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(title)}`)
        .then(r => r.json())
        .then(data => {
          if (data.anilist_id) resolvedAnilistRef.current = data.anilist_id;
        })
        .catch(() => {});
    }
  }, [title]);

  useEffect(() => {
    if (player.masterUrl && videoRef.current) {
      player.loadPlayer(player.masterUrl);
    }
    return () => player.destroyHls();
  }, [player.masterUrl]);

  const onEpisodeChangeRef = useRef(onEpisodeChange);
  onEpisodeChangeRef.current = onEpisodeChange;

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const loadStream = useCallback(async (s: string, ep: number) => {
    player.setLoadingStream(true);
    player.setError(null);
    subs.resetSubs();
    player.destroyHls();
    player.setStreamData(null);
    player.setMasterUrl(null);
    fallbackAttemptedRef.current = false;
    player.fallbackAttemptedRef.current = false;
    player.sourceRef.current = null;
    player.setPlayerStatus("idle");

    setStatusText("Loading stream...");
    const result = await Promise.race([
      tryGogoanime(ep).then((ok) => ok && "gogoanime"),
      tryAnitsu(ep).then((ok) => ok && "anitsu"),
    ]);
    if (!result) {
      player.setLoadingStream(false);
      setStatusText("");
      player.setError("Streaming is temporarily unavailable. Try again later.");
    }
  }, [tryGogoanime, tryAnitsu]);

  const handleRetry = useCallback(() => {
    player.resetPlayer();
    loadStream(slug, currentEp);
  }, [slug, currentEp, loadStream]);

  return (
    <div className={clsx(
      "transition-all duration-300",
      isTheater && "fixed inset-0 z-50 bg-black flex flex-col"
    )}>
      <div
        ref={containerRef}
        className={clsx(
          "relative w-full overflow-hidden bg-black group",
          isTheater
            ? "flex-1 rounded-none aspect-auto"
            : "aspect-video rounded-xl"
        )}
      >
        {player.loadingStream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
            {statusText && (
              <span className="text-[10px] text-mist">{statusText}</span>
            )}
          </div>
        ) : player.streamData ? (
          <>
            <video ref={videoRef} className="h-full w-full" controls playsInline controlsList="nofullscreen" crossOrigin="anonymous" />
            {player.playerStatus === "buffering" && !player.error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-full bg-black/50 p-3">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              </div>
            )}
            {subs.activeCues.length > 0 && (
              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-0.5 px-4 pointer-events-none z-10">
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
            {isTheater && (
              <button
                onClick={() => setIsTheater(false)}
                className="absolute top-3 right-14 z-20 rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:text-white flex items-center gap-1.5"
                title="Exit theater mode"
              >
                <Shrink className="h-3.5 w-3.5" />
                Exit
              </button>
            )}
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  containerRef.current?.requestFullscreen().catch(() => {});
                } else {
                  document.exitFullscreen().catch(() => {});
                }
              }}
              className="absolute top-2 right-2 z-20 rounded-md bg-black/50 p-1.5 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 hover:text-white"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </>
        ) : nextEpCountdown > 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
            <div className="flex items-center gap-2 text-white">
              <Play className="h-5 w-5 text-primary-400" />
              <span className="text-lg font-semibold">Next episode in {nextEpCountdown}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                  setNextEpCountdown(0);
                  const next = currentEpRef.current + 1;
                  setCurrentEp(next);
                  if (onEpisodeChangeRef.current) onEpisodeChangeRef.current(next);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-500"
              >
                <Play className="h-3 w-3" />
                Play now
              </button>
              <button
                onClick={() => {
                  if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                  setNextEpCountdown(0);
                  setAutoPlay(false);
                }}
                className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
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

      {isTheater && (
        <div className="shrink-0 bg-black/90 px-4 py-2 flex items-center gap-3 border-t border-white/10 overflow-x-auto">
          <button
            onClick={() => setIsTheater(false)}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition shrink-0"
          >
            <Shrink className="h-3.5 w-3.5" />
            Exit theater
          </button>
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                containerRef.current?.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition shrink-0"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          {(["sub", "dub"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => { if (opt !== audio) { setAudio(opt); } }}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0",
                audio === opt ? "bg-primary-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/20"
              )}
            >
              {opt === "sub" ? "Sub" : "Dub"}
            </button>
          ))}
          {totalEps && totalEps > 1 && (
            <button
              onClick={() => { setAutoPlay((p) => !p); setNextEpCountdown(0); if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; } }}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition shrink-0",
                autoPlay ? "bg-primary-600/20 text-primary-300" : "bg-white/10 text-white/70 hover:bg-white/20"
              )}
            >
              <Play className={clsx("h-3 w-3", !autoPlay && "opacity-50")} />
              {autoPlay ? "Auto-play on" : "Auto-play off"}
            </button>
          )}
          {totalEps && totalEps > 1 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { const prev = Math.max(1, currentEp - 1); setCurrentEp(prev); if (onEpisodeChangeRef.current) onEpisodeChangeRef.current(prev); }}
                disabled={currentEp <= 1}
                className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20 transition disabled:opacity-30"
              >Prev</button>
              <span className="text-xs font-mono text-white/70">Ep {currentEp}{totalEps ? ` / ${totalEps}` : ""}</span>
              <button
                onClick={() => { const next = currentEp + 1; setCurrentEp(next); if (onEpisodeChangeRef.current) onEpisodeChangeRef.current(next); }}
                disabled={!!(totalEps && currentEp >= totalEps)}
                className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20 transition disabled:opacity-30"
              >Next</button>
            </div>
          )}
        </div>
      )}

      {!isTheater && subs.subtitles.length > 0 && (
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
              subs.selectedSub === -1
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            Off
          </button>
        </div>
      )}

      {!isTheater && totalEps && totalEps > 1 && (
        <div className="mt-2">
          <button
            onClick={() => { setAutoPlay((p) => !p); setNextEpCountdown(0); if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; } }}
            className={clsx(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
              autoPlay
                ? "bg-primary-600/20 text-primary-300"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <Play className={clsx("h-3 w-3", !autoPlay && "opacity-50")} />
            {autoPlay ? "Auto-play on" : "Auto-play off"}
          </button>
        </div>
      )}

      {player.streamData && (() => {
        const levels = player.levels;
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

      {!isTheater && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setIsTheater(true)}
            className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-mist hover:bg-white/10 hover:text-paper transition"
            title="Theater mode"
          >
            <RectangleHorizontal className="h-3.5 w-3.5" />
            Expand
          </button>
        </div>
      )}

      <div className={clsx("mt-3 flex gap-2", isTheater && "hidden")}>
        {(["sub", "dub"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => {
              if (opt !== audio) {
                setAudio(opt);
              }
            }}
            className={clsx(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              audio === opt
                ? "bg-primary-600 text-white"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            {opt === "sub" ? "Sub" : "Dub"}
          </button>
        ))}
        <button
          onClick={() => {
            const fname = `${title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}_E${currentEp}`;
            const dlUrl = api.downloadUrl({
              slug,
              anilist_id: resolvedAnilistRef.current || undefined,
              ep: currentEp,
              audio,
              filename: fname,
            });
            window.open(dlUrl, "_blank");
          }}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-white/5 text-mist hover:bg-white/10 transition disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          Download
        </button>
      </div>

      {!isTheater && ((totalEps && totalEps > 1) || currentEp > 1) ? (
        <div className="mt-3">
          {totalEps && totalEps > 1 ? (
            <>
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
                        if (onEpisodeChange) onEpisodeChange(ep);
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
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prev = Math.max(1, currentEp - 1);
                  setCurrentEp(prev);
                  if (onEpisodeChange) onEpisodeChange(prev);
                }}
                disabled={currentEp <= 1}
                className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-mist transition hover:bg-white/10 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-sm font-mono text-mist">Ep {currentEp}</span>
              <button
                onClick={() => {
                  const next = currentEp + 1;
                  setCurrentEp(next);
                  if (onEpisodeChange) onEpisodeChange(next);
                }}
                className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-mist transition hover:bg-white/10"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!isTheater && player.error && !player.loadingStream && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs flex-1">{friendlyError(player.error)}</span>
          <button onClick={handleRetry} className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30 transition">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
