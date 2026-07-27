"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, ChevronDown, Loader2, AlertTriangle, Monitor, RotateCcw, Download, Maximize2, Minimize2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSubtitles } from "@/hooks/use-subtitles";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import { EpisodeComments } from "@/components/episode-comments";
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
  videoFreeze: "Playback froze on this source",
  stalled: "Playback froze on this source",
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
  const [audio, setAudio] = useState<"sub" | "dub">("sub");
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [nextEpCountdown, setNextEpCountdown] = useState(0);
  const [statusText, setStatusText] = useState<string>("");
  const initialLoadDoneRef = useRef(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subs = useSubtitles(videoRef);
  const currentEpRef = useRef(1);
  currentEpRef.current = currentEp;
  const totalEpsRef = useRef(totalEps);
  totalEpsRef.current = totalEps;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const tryAnitsuFallback = useCallback(async (ep: number, epAudio: string = audio): Promise<boolean> => {
    setStatusText("");
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anitsu/stream?q=${encodeURIComponent(animeTitle)}&ep=${ep}&audio=${epAudio}`
      ).then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      });
      if (res && (res.stream_url || res.embed_url)) {
        player.sourceRef.current = "anitsu";

        if (res.stream_url) {
          subs.setSubs((res.subtitles || []).map((s: any) => {
            const proxySubUrl = `/api/proxy?url=${encodeURIComponent(s.file)}&referer=${encodeURIComponent(s.referer || "")}`;
            return { ...s, file: proxySubUrl };
          }));

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
      }
    } catch { }
    setStatusText("");
    return false;
  }, [animeTitle]);

  const onFatalError = useCallback(async (errorType: string) => {
    if (player.sourceRef.current === "gogoanime" || player.sourceRef.current === null) {
      player.sourceRef.current = null;
      player.destroyHls();
      player.setStreamData(null);
      player.setMasterUrl(null);
      player.setError(null);
      player.setPlayerStatus("idle");
      player.setLoadingStream(true);
      setStatusText("");
      const ok = await tryAnitsuFallback(currentEpRef.current);
      if (!ok) {
        player.setError(friendlyError("Playback error: " + errorType));
        player.setLoadingStream(false);
      }
      return;
    }

    player.setError(friendlyError("Playback error: " + errorType));
    player.setLoadingStream(false);
  }, [tryAnitsuFallback]);

  const onMediaEnded = useCallback(() => {
    if (!autoPlay) return;
    const next = currentEpRef.current + 1;
    if (totalEpsRef.current && next > totalEpsRef.current) return;
    setNextEpCountdown(5);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setNextEpCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCurrentEp(currentEpRef.current + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [autoPlay]);

  const onAfterLoad = useCallback(() => {
    if (subs.subtitles.length > 0) {
      subs.loadSubtitles();
    }
  }, [subs]);

  const player = useHlsPlayer(videoRef, onAfterLoad, onFatalError, onMediaEnded);

  useEffect(() => {
    initialLoadDoneRef.current = false;
    searchAnime();
    return () => player.destroyHls();
  }, [animeTitle]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
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
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const loadStream = useCallback(async (slug: string | null, ep: number) => {
    player.setLoadingStream(true);
    player.setError(null);
    subs.resetSubs();
    player.destroyHls();
    player.setStreamData(null);
    player.setMasterUrl(null);
    player.fallbackAttemptedRef.current = false;
    player.sourceRef.current = null;
    player.setPlayerStatus("idle");

    if (slug) {
      setStatusText("");
      const streamRes = await api.gogoanimeStream(slug, ep, audio).catch(() => null);
      const data = streamRes?.data;

      if (data?.direct_stream?.stream_url) {
        player.sourceRef.current = "gogoanime";
        const proxiedUrl = api.gogoanimeEmbedProxy(data.direct_stream.stream_url, data.direct_stream.referer);
        let qualities = [{ quality: "Auto", url: proxiedUrl }];
        try {
          const m3u8Resp = await fetch(proxiedUrl);
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
                  let label = resMatch ? resMatch[1].split("x")[1] + "p" : `${Math.round(parseInt(bwMatch[1]) / 1000)}kbps`;
                  parsed.push({ quality: label, url: nextLine.startsWith("http") ? nextLine : proxiedUrl });
                }
              }
            }
            if (parsed.length > 1) qualities = parsed;
          }
        } catch { }
        player.setStreamData({ qualities });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        setStatusText("");
        fetchSubtitlesInBackground(ep);
        return;
      }

      if (data?.qualities) {
        player.sourceRef.current = "gogoanime";
        player.setStreamData({ qualities: data.qualities });
        player.setMasterUrl(api.gogoanimeMaster(slug, ep, audio));
        player.setLoadingStream(false);
        setStatusText("");
        fetchSubtitlesInBackground(ep);
        return;
      }
    }

    setStatusText("");
    const anitsuOk = await tryAnitsuFallback(ep);
    if (anitsuOk) return;

    player.setLoadingStream(false);
    setStatusText("");
    player.setError("Streaming is temporarily unavailable. Try again later.");
  }, [tryAnitsuFallback, animeTitle, audio]);

  const fetchSubtitlesInBackground = useCallback((ep: number) => {
    const fetchEp = currentEpRef.current;
    api.fetchSubtitles(animeTitle, fetchEp, resolvedAnilistRef.current || undefined)
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
  }, [animeTitle, subs]);

  useEffect(() => {
    if (selectedSlug && currentEp) {
      if (initialLoadDoneRef.current) {
        loadStream(selectedSlug, currentEp);
      } else {
        initialLoadDoneRef.current = true;
      }
    }
  }, [selectedSlug, currentEp, audio]);

  async function searchAnime() {
    player.setLoadingStream(true);
    player.setError(null);
    setStatusText("");

    const gogoResult = await api.gogoanimeSearch(animeTitle).catch(() => null);
    const gogoData = gogoResult?.data;

    let gogoSlug: string | null = null;
    if (gogoData && gogoData.length > 0) gogoSlug = gogoData[0].slug;

    if (gogoData) {
      setResults(gogoData);
      if (gogoData[0]) {
        const ep = gogoData[0].episodes_count || gogoData[0].actual_episodes_count || gogoData[0].latest_episode || null;
        if (ep) setTotalEps(ep);
        setSelectedSlug(gogoData[0].slug);
      }
    }

    setStatusText("");

    if (gogoSlug) {
      loadStream(gogoSlug, 1);
      return;
    }

    if (resolvedAnilistRef.current) {
      loadStream(null, 1);
    } else {
      player.setLoadingStream(false);
    }
  }

  const handleRetry = useCallback(() => {
    player.resetPlayer();
    loadStream(selectedSlug, currentEp);
  }, [selectedSlug, currentEp, loadStream]);

  const showResults = results.length > 0 || player.loadingStream || player.streamData || player.masterUrl;

  if (!showResults) return null;

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

      <div ref={containerRef} className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black group">
        {player.loadingStream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
            {statusText && (
              <span className="text-[10px] text-mist">{statusText}</span>
            )}
          </div>
        ) : player.streamData ? (
          <>
            <video ref={videoRef} className="h-full w-full" controls playsInline controlsList="nofullscreen" />
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
                  setCurrentEp(currentEpRef.current + 1);
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

      {selectedSlug && (
        <div className="mt-3 flex gap-2">
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
              const dlUrl = api.downloadUrl({
                slug: selectedSlug || undefined,
                anilist_id: resolvedAnilistRef.current || undefined,
                ep: currentEp,
                audio,
                filename: `${animeTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim()}_E${currentEp}`,
              });
              window.open(dlUrl, "_blank");
            }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-white/5 text-mist hover:bg-white/10 transition"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      )}

      {subs.subtitles.length > 0 && (
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

      {selectedSlug && totalEps && totalEps > 1 && (
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

      {selectedSlug && (
        <EpisodeComments slug={selectedSlug} episodeNumber={currentEp} />
      )}
    </section>
  );
}
