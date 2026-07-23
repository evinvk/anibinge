"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, ChevronDown, Loader2, AlertTriangle, Monitor } from "lucide-react";
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

export function StreamingPlayer({ animeTitle, anilistId }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);

  const subs = useSubtitles(videoRef);
  const currentEpRef = useRef(1);
  currentEpRef.current = currentEp;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsTargetRef = useRef<Element | null>(null);

  const loadAnivexaFallback = useCallback(async (ep: number) => {
    let aid = resolvedAnilistRef.current;
    if (!aid) {
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
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}`
      ).then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      });
      if (res && res.stream_url) {
        subs.setSubs((res.subtitles || []).map((s: any) => {
          let proxyUrl = `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(btoa(s.file))}`;
          if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
          return { ...s, file: proxyUrl };
        }));
        const masterUrlFull = `${API_BASE}/api/v1/streaming/anivexa/${aid}/master?ep=${ep}`;
        player.sourceRef.current = "anivexa";
        player.setMasterUrl(masterUrlFull);
        player.setStreamData({ qualities: [{ quality: "auto", url: masterUrlFull }] });
        player.setLoadingStream(false);
        return true;
      }
    } catch { /* fallback failed */ }
    return false;
  }, [animeTitle]);

  const onFatalError = useCallback(async (errorType: string) => {
    if (player.sourceRef.current === "gogoanime" && !player.fallbackAttemptedRef.current) {
      player.fallbackAttemptedRef.current = true;
      player.destroyHls();
      player.setLoadingStream(true);
      player.setError(null);

      if (!resolvedAnilistRef.current) {
        try {
          const res = await fetch(
            `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(animeTitle)}`
          ).then(r => r.json());
          if (res.anilist_id) resolvedAnilistRef.current = res.anilist_id;
        } catch {}
      }

      if (resolvedAnilistRef.current) {
        const ok = await loadAnivexaFallback(currentEpRef.current);
        if (!ok) {
          player.setError("Streaming unavailable from all providers");
          player.setLoadingStream(false);
        }
      } else {
        player.setError("Streaming unavailable from all providers");
        player.setLoadingStream(false);
      }
    } else {
      player.setError("Playback error: " + errorType);
    }
  }, [loadAnivexaFallback]);

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
    player.fallbackAttemptedRef.current = false;

    let aid = resolvedAnilistRef.current;
    if (!aid) {
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

    const subsPromise = aid
      ? fetch(`${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      : Promise.resolve(null);

    const [gogoRes, subsData] = await Promise.all([
      api.gogoanimeStream(slug, ep).catch(() => null),
      subsPromise,
    ]);

    if (subsData?.subtitles?.length) {
      subs.setSubs(subsData.subtitles.map((s: any) => {
        let proxyUrl = `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(btoa(s.file))}`;
        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
        return { ...s, file: proxyUrl };
      }));
    }

    const data = gogoRes?.data;
    if (data?.qualities) {
      player.sourceRef.current = "gogoanime";
      player.setStreamData({ qualities: data.qualities });
      player.setMasterUrl(api.gogoanimeMaster(slug, ep));
      player.setLoadingStream(false);
      return;
    }

    player.fallbackAttemptedRef.current = true;
    const ok = await loadAnivexaFallback(ep);
    if (!ok) {
      player.setError("No streaming sources available for this episode");
      player.setLoadingStream(false);
    }
  }, [animeTitle, loadAnivexaFallback]);

  useEffect(() => {
    if (selectedSlug && currentEp) {
      loadStream(selectedSlug, currentEp);
    }
  }, [selectedSlug, currentEp, loadStream]);

  async function searchAnime() {
    player.setLoadingStream(true);
    player.setError(null);
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

  if (player.loadingStream && !player.streamData) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Searching for streaming sources...</span>
      </div>
    );
  }

  if (player.error && results.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs">{player.error}</span>
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
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          </div>
        ) : player.streamData ? (
          <>
            <video ref={videoRef} className="h-full w-full" controls playsInline />
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mist">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span className="text-sm">{player.error}</span>
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

      {player.streamData && player.streamData.qualities.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {player.streamData.qualities.map((s, i) => (
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
              {s.quality}
            </button>
          ))}
        </div>
      )}

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
          <span className="text-xs">{player.error}</span>
        </div>
      )}
    </section>
  );
}
