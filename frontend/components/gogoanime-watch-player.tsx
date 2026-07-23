"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, AlertTriangle, Monitor } from "lucide-react";
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
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function GogoAnimeWatchPlayer({ slug, title, totalEps, anilistId }: Props) {
  const [currentEp, setCurrentEp] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const currentEpRef = useRef(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsTargetRef = useRef<Element | null>(null);
  const [audio, setAudio] = useState<"sub" | "dub">("sub");

  const subs = useSubtitles(videoRef);

  const loadAnivexaFallback = useCallback(async (ep: number) => {
    let aid = resolvedAnilistRef.current;
    if (!aid) {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(title)}`
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
        `${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}&audio=${audio}`
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
        const masterUrlFull = `${API_BASE}/api/v1/streaming/anivexa/${aid}/master?ep=${ep}&audio=${audio}`;
        player.sourceRef.current = "anivexa";
        player.setMasterUrl(masterUrlFull);
        player.setStreamData({ qualities: [{ quality: "auto", url: masterUrlFull }] });
        player.setLoadingStream(false);
        return true;
      }
    } catch { /* fallback failed */ }
    return false;
  }, [title, audio]);

  const onFatalError = useCallback(async (errorType: string) => {
    if (player.sourceRef.current === "gogoanime" && !player.fallbackAttemptedRef.current) {
      player.fallbackAttemptedRef.current = true;
      player.destroyHls();
      player.setLoadingStream(true);
      player.setError(null);

      if (!resolvedAnilistRef.current) {
        try {
          const res = await fetch(
            `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(title)}`
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
    currentEpRef.current = currentEp;
  }, [currentEp]);

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

  useEffect(() => {
    if (subs.subtitles.length > 0 && videoRef.current) {
      subs.loadSubtitles();
    }
  }, [subs.subtitles]);

  const loadStream = useCallback(async (s: string, ep: number) => {
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
          `${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(title)}`
        ).then(r => r.json());
        if (res.anilist_id) {
          aid = res.anilist_id;
          resolvedAnilistRef.current = aid;
        }
      } catch { /* not critical */ }
    }

    const subsPromise = aid
      ? fetch(`${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}&audio=${audio}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      : Promise.resolve(null);

    const [gogoRes, subsData] = await Promise.all([
      api.gogoanimeStream(s, ep, audio).catch(() => null),
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
      player.setMasterUrl(api.gogoanimeMaster(s, ep, audio));
      player.setLoadingStream(false);
      return;
    }

    player.fallbackAttemptedRef.current = true;
    const ok = await loadAnivexaFallback(ep);
    if (!ok) {
      player.setError("No streaming sources available for this episode");
      player.setLoadingStream(false);
    }
  }, [title, loadAnivexaFallback, audio]);

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {player.loadingStream ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          </div>
        ) : player.streamData ? (
          <>
            <video ref={videoRef} className="h-full w-full" controls playsInline />
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
              subs.selectedSub === -1
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
      </div>

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
    </div>
  );
}
