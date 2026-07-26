"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, ChevronDown, Loader2, AlertTriangle, Monitor, RotateCcw, Download } from "lucide-react";
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

function makeProxyUrl(file: string, referer: string) {
  return `${API_BASE}/api/v1/streaming/proxy?url=${encodeURIComponent(file)}&referer=${encodeURIComponent(referer || "")}`;
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

export function StreamingPlayer({ animeTitle, anilistId }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [audio, setAudio] = useState<"sub" | "dub">("sub");
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const initialLoadDoneRef = useRef(false);

  const subs = useSubtitles(videoRef);
  const currentEpRef = useRef(1);
  currentEpRef.current = currentEp;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsTargetRef = useRef<Element | null>(null);

  const tryAnivexaFallback = useCallback(async (ep: number): Promise<boolean> => {
    let aid = resolvedAnilistRef.current;
    if (!aid) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15000);
        const res = await fetch(
          `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(animeTitle)}`,
          { signal: ac.signal }
        ).then(r => r.json());
        clearTimeout(timer);
        if (res.anilist_id) {
          aid = res.anilist_id;
          resolvedAnilistRef.current = aid;
        }
      } catch { /* not critical */ }
    }
    if (!aid) return false;
    setStatusText("");
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}&source=anivexa`,
        { signal: ac.signal }
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error("not ok");
      const json = await res.json();
      if (json && (json.stream_url || json.embed_url)) {
        player.sourceRef.current = "anivexa";

        if (json.stream_url) {
          subs.setSubs((json.subtitles || []).map((s: any) => {
            return { ...s, file: makeProxyUrl(s.file, s.referer) };
          }));

          if (json.stream_type === "mp4") {
            const mp4Url = makeProxyUrl(json.stream_url, json.referer || "");
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

          const hlsUrl = makeProxyUrl(json.stream_url, json.referer || "");
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
                      ? makeProxyUrl(nextLine, json.referer || "")
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

      }
    } catch { /* fallback failed */ }
    setStatusText("");
    return false;
  }, [animeTitle]);

  const onFatalError = useCallback(async (errorType: string) => {
    console.error("[onFatalError]", { errorType, source: player.sourceRef.current });

    // If GogoAnime failed, try Anivexa as fallback
    if (player.sourceRef.current === "gogoanime" || player.sourceRef.current === null) {
      player.sourceRef.current = null;
      player.destroyHls();
      player.setStreamData(null);
      player.setMasterUrl(null);
      player.setError(null);
      player.setPlayerStatus("idle");
      player.setLoadingStream(true);
      setStatusText("");
      const ok = await tryAnivexaFallback(currentEpRef.current);
      if (!ok) {
        player.setError(friendlyError("Playback error: " + errorType));
        player.setLoadingStream(false);
      }
      return;
    }

    // If Anivexa failed, try GogoAnime as fallback
    if (player.sourceRef.current === "anivexa" && selectedSlug) {
      player.sourceRef.current = null;
      player.destroyHls();
      player.setStreamData(null);
      player.setMasterUrl(null);
      player.setError(null);
      player.setPlayerStatus("idle");
      player.setLoadingStream(true);
      setStatusText("");
      const streamRes = await api.gogoanimeStream(selectedSlug, currentEpRef.current, audio).catch(() => null);
      const data = streamRes?.data;
      if (data?.direct_stream?.stream_url) {
        player.sourceRef.current = "gogoanime";
        const proxiedUrl = api.gogoanimeEmbedProxy(data.direct_stream.stream_url, data.direct_stream.referer);
        player.setStreamData({ qualities: [{ quality: "Auto", url: proxiedUrl }] });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        setStatusText("");
        return;
      }
      if (data?.qualities) {
        player.sourceRef.current = "gogoanime";
        player.setStreamData({ qualities: data.qualities });
        player.setMasterUrl(api.gogoanimeMaster(selectedSlug, currentEpRef.current, audio));
        player.setLoadingStream(false);
        setStatusText("");
        return;
      }
    }

    player.setError(friendlyError("Playback error: " + errorType));
    player.setLoadingStream(false);
  }, [selectedSlug, audio, tryAnivexaFallback]);

  const player = useHlsPlayer(videoRef, subs.loadSubtitles, onFatalError);

  useEffect(() => {
    initialLoadDoneRef.current = false;
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

    // 1. Try GogoAnime first
    if (slug) {
      setStatusText("");
      const streamRes = await api.gogoanimeStream(slug, ep, audio).catch(() => null);
      const data = streamRes?.data;

      // If backend only returned embed_url (extraction failed), fall through to Anivexa
      if (data?.embed_url && !data?.direct_stream) {
        // fall through to Anivexa below
      } else if (data?.direct_stream?.stream_url) {
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
                  parsed.push({ quality: label, url: proxiedUrl.includes("url=") ? proxiedUrl.replace(/url=[^&]+/, `url=${btoa(nextLine).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`) : nextLine });
                }
              }
            }
            if (parsed.length > 1) qualities = parsed;
          }
        } catch { /* keep auto */ }
        player.setStreamData({ qualities });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        setStatusText("");
        return;
      }

      if (data?.qualities) {
        player.sourceRef.current = "gogoanime";
        player.setStreamData({ qualities: data.qualities });
        player.setMasterUrl(api.gogoanimeMaster(slug, ep, audio));
        player.setLoadingStream(false);
        setStatusText("");
        return;
      }
    }

    // 2. If GogoAnime failed, try Anivexa as fallback
    setStatusText("");
    const anivexaOk = await tryAnivexaFallback(ep);
    if (anivexaOk) return;

    player.setLoadingStream(false);
    setStatusText("");
    player.setError("Streaming is temporarily unavailable. Try again later.");
  }, [tryAnivexaFallback, animeTitle, audio]);

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

    // GogoAnime search only — AniList resolve happens in tryAnivexaOnly when needed
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

    // No GogoAnime match — try Anivexa-only (will resolve AniList ID if needed)
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

      {player.error && !player.streamData && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs flex-1">{player.error}</span>
          <button onClick={handleRetry} className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30 transition">
            Retry
          </button>
        </div>
      )}

      <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
        {player.loadingStream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
            {statusText && (
              <span className="text-[10px] text-mist">{statusText}</span>
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
                  player.setError(null);
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

      {selectedSlug && (
        <EpisodeComments slug={selectedSlug} episodeNumber={currentEp} />
      )}
    </section>
  );
}
