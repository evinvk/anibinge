"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Loader2, AlertTriangle, Monitor, Play, RotateCcw, Download, Maximize2, Minimize2, RectangleHorizontal, Shrink, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { useSubtitles } from "@/hooks/use-subtitles";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import { InjectedAdScript } from "@/components/injected-ad-script";
import { VideoAdOverlay } from "@/components/video-ad-overlay";
import { getEntry, loadHistory, saveProgress, markWatched } from "@/lib/watch-history";
import { getSkipTimes, recordSkipIntro, recordSkipOutro, DEFAULT_INTRO_START, DEFAULT_INTRO_LENGTH, DEFAULT_OUTRO_LENGTH } from "@/lib/skip-intro";
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
  historyScope?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

type ServerPref = "auto" | "anitsu" | "gogoanime" | "hindi";

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

export function GogoAnimeWatchPlayer({ slug, title, totalEps, anilistId, initialEp = 1, onEpisodeChange, historyScope = "guest" }: Props) {
  const [currentEp, setCurrentEp] = useState(initialEp);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const currentEpRef = useRef(initialEp);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [audio, setAudio] = useState<"sub" | "dub" | "hindi">("sub");
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const [resumeInfo, setResumeInfo] = useState<{ time: number; duration: number } | null>(null);
  const resumeDoneRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveRef = useRef(0);
  const lastSkipStateRef = useRef({ intro: false, outro: false });
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const [serverPref, setServerPref] = useState<ServerPref>(() => {
    try {
      const saved = localStorage.getItem("anibinge_server_pref");
      return saved === "anitsu" || saved === "gogoanime" || saved === "hindi" ? saved : "auto";
    } catch { return "auto"; }
  });
  const serverPrefRef = useRef(serverPref);
  serverPrefRef.current = serverPref;

  const [statusText, setStatusText] = useState<string>("");
  const [autoPlay, setAutoPlay] = useState(true);
  const [nextEpCountdown, setNextEpCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadedStreamRef = useRef<{ ep: number; data: any } | null>(null);
  const preloadingRef = useRef(false);

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

  const tryAnitsu = useCallback(async (ep: number, epAudio?: string): Promise<boolean> => {
    setStatusText("");
    try {
      const aid = resolvedAnilistRef.current;
      const useAudio = epAudio || audioRef.current;
      let res: any;

      if (aid) {
        const url = `${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}&audio=${useAudio}`;
        res = await fetch(url).then(r => {
          if (!r.ok) throw new Error("not ok");
          return r.json();
        });
      } else {
        res = await fetch(
          `${API_BASE}/api/v1/streaming/anitsu/stream?q=${encodeURIComponent(title)}&ep=${ep}&audio=${useAudio}`
        ).then(r => {
          if (!r.ok) throw new Error("not ok");
          return r.json();
        });
      }

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
          if (!m3u8Resp.ok) throw new Error("unplayable playlist");
          const m3u8Text = await m3u8Resp.text();
          if (!m3u8Text.startsWith("#EXT")) throw new Error("unplayable playlist");
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
        } catch (e) {
          throw e;
        }

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

  const tryHindi = useCallback(async (ep: number): Promise<boolean> => {
    setStatusText("Loading Hindi stream...");
    try {
      const aid = resolvedAnilistRef.current;
      if (!aid) return false;
      const streamRes = await api.hindiStream(aid, ep).catch(() => null);
      const data = streamRes;

      if (data?.stream_url) {
        subs.setSubs([]);
        player.sourceRef.current = "hindi";
        const proxiedUrl = `/api/proxy?url=${encodeURIComponent(data.stream_url)}&referer=${encodeURIComponent(data.referer || "https://rubystm.com/")}`;
        player.setStreamData({ qualities: [{ quality: "Auto", url: proxiedUrl }] });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        setStatusText("");
        return true;
      }
    } catch { }
    setStatusText("");
    return false;
  }, []);

  const fetchSubtitlesInBackground = useCallback((ep: number) => {
    const fetchEp = currentEpRef.current;
    api.fetchSubtitles(title, fetchEp, resolvedAnilistRef.current || undefined)
      .then((subRes) => {
        if (subRes.subtitles?.length > 0 && fetchEp === currentEpRef.current) {
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
    markWatched(historyScope, slug, title, currentEpRef.current);
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
  }, [autoPlay, totalEps, historyScope, slug, title]);

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
      preloadedStreamRef.current = null;
      loadStream(slug, currentEp);
    }
  }, [slug, currentEp, audio, serverPref]);

  // Preload next episode in background
  useEffect(() => {
    if (audio === "hindi") return;
    if (!currentEp || !totalEps || currentEp >= totalEps || preloadingRef.current) return;
    const nextEp = currentEp + 1;
    preloadingRef.current = true;
    api.gogoanimeStream(slug, nextEp, audio).then((res) => {
      if (res?.data) preloadedStreamRef.current = { ep: nextEp, data: res.data };
    }).catch(() => {}).finally(() => { preloadingRef.current = false; });
  }, [currentEp, slug, audio, totalEps]);

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
    const saved = getEntry(historyScope, slug);
    const canResume = saved && saved.ep === currentEp && saved.time > 20 && (saved.duration === 0 || saved.time < saved.duration - 60);
    if (canResume) {
      resumeDoneRef.current = false;
      setResumeInfo({ time: saved.time, duration: saved.duration });
    } else {
      setResumeInfo(null);
    }
    return () => { if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current); };
  }, [slug, currentEp, historyScope]);

  const applyResume = useCallback(() => {
    const v = videoRef.current;
    if (!v || !resumeInfo) return;
    resumeDoneRef.current = true;
    v.currentTime = resumeInfo.time;
    v.play().catch(() => {});
    setResumeInfo(null);
  }, [resumeInfo]);

  const startOver = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    resumeDoneRef.current = true;
    v.currentTime = 0;
    saveProgress(historyScope, { slug, title, ep: currentEpRef.current, time: 0, duration: v.duration || 0 });
    setResumeInfo(null);
  }, [historyScope, slug, title]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      const t = video.currentTime;
      const d = video.duration || 0;

      if (t > 0 && Date.now() - lastSaveRef.current > 5000) {
        lastSaveRef.current = Date.now();
        saveProgress(historyScope, { slug, title, ep: currentEpRef.current, time: t, duration: d });
      }

      if (resumeInfo && !resumeDoneRef.current && video.readyState >= 1 && (t === 0 || Math.abs(t) < 0.5)) {
        resumeDoneRef.current = true;
        video.currentTime = resumeInfo.time;
        video.play().catch(() => {});
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => setResumeInfo(null), 8000);
      }

      const times = getSkipTimes(slug);
      const introStart = times.intro ?? DEFAULT_INTRO_START;
      const introEnd = introStart + DEFAULT_INTRO_LENGTH;
      const introVisible = t >= introStart - 3 && t < introEnd;
      const outroVisible = d > 180 && t >= d - DEFAULT_OUTRO_LENGTH && t < d - 5;
      if (introVisible !== lastSkipStateRef.current.intro) {
        lastSkipStateRef.current.intro = introVisible;
        setShowSkipIntro(introVisible);
      }
      if (outroVisible !== lastSkipStateRef.current.outro) {
        lastSkipStateRef.current.outro = outroVisible;
        setShowSkipOutro(outroVisible);
      }
    };

    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [slug, title, historyScope, resumeInfo]);

  const skipIntro = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const times = getSkipTimes(slug);
    const end = (times.intro ?? DEFAULT_INTRO_START) + DEFAULT_INTRO_LENGTH;
    recordSkipIntro(slug, v.currentTime);
    v.currentTime = end;
    v.play().catch(() => {});
    setShowSkipIntro(false);
  }, [slug]);

  const skipOutro = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || 0;
    if (d > 0) {
      recordSkipOutro(slug, v.currentTime);
      v.currentTime = Math.max(0, d - 15);
    }
    setShowSkipOutro(false);
  }, [slug]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
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

    // Check if this episode was preloaded
    const preloaded = preloadedStreamRef.current;
    if (preloaded?.ep === ep && preloaded.data) {
      preloadedStreamRef.current = null;
      const data = preloaded.data;
      if (data.direct_stream?.stream_url) {
        player.sourceRef.current = "gogoanime";
        const proxiedUrl = api.gogoanimeEmbedProxy(data.direct_stream.stream_url, data.direct_stream.referer);
        player.setStreamData({ qualities: [{ quality: "Auto", url: proxiedUrl }] });
        player.setMasterUrl(proxiedUrl);
        player.setLoadingStream(false);
        fetchSubtitlesInBackground(ep);
        return;
      }
      if (data.qualities) {
        player.sourceRef.current = "gogoanime";
        player.setStreamData({ qualities: data.qualities });
        player.setMasterUrl(api.gogoanimeMaster(s, ep, audio));
        player.setLoadingStream(false);
        fetchSubtitlesInBackground(ep);
        return;
      }
    }

    setStatusText("Loading stream...");

    // Ensure we have an AniList ID before trying Anivexa
    if (!resolvedAnilistRef.current && title) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/streaming/anivexa/resolve?q=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (data.anilist_id) resolvedAnilistRef.current = data.anilist_id;
      } catch {}
    }

    // Try Anivexa first (works from Vercel), then GogoAnime (Vercel-blocked)
    // When Hindi is selected, try the ToonStream Hindi dub first, then fall back.
    // The user's chosen server preference reorders the chain.
    const baseOrder: ServerPref[] = audio === "hindi" ? ["hindi", "anitsu", "gogoanime"] : ["anitsu", "gogoanime"];
    const pref = serverPrefRef.current;
    const order: ServerPref[] = pref === "auto" ? baseOrder : [pref, ...baseOrder.filter((s) => s !== pref)];

    let result: string | null = null;
    for (const s of order) {
      const ok = s === "hindi" ? await tryHindi(ep) : s === "anitsu" ? await tryAnitsu(ep) : await tryGogoanime(ep);
      if (ok) { result = s; break; }
    }
    if (!result) {
      // Try donghua endpoint as additional fallback (for Chinese anime not on GogoAnime)
      try {
        const aid = resolvedAnilistRef.current;
        if (aid) {
          const res = await fetch(
            `${API_BASE}/api/v1/streaming/donghua/stream?q=${encodeURIComponent(title)}&ep=${ep}&audio=${audio}&anilist_id=${aid}`
          ).then(r => { if (!r.ok) throw new Error("not ok"); return r.json(); });
          const servers = res?.data?.servers || [];
          let s: any = null;
          if (res?.data?.stream_url) {
            s = res.data;
          } else {
            for (const server of servers) {
              if (!server?.stream_url) continue;
              try {
                const resolved = await fetch(
                  `${API_BASE}/api/v1/streaming/donghua/resolve-embed?url=${encodeURIComponent(server.stream_url)}`
                ).then(r => { if (!r.ok) throw new Error("not ok"); return r.json(); });
                const d = resolved?.data;
                if (d?.stream_url && d.type !== "embed") {
                  s = { stream_url: d.stream_url, stream_type: d.type === "mp4" ? "mp4" : "hls" };
                  break;
                }
              } catch {}
            }
          }
          if (s?.stream_url) {
            player.sourceRef.current = "anitsu";
            if (s.stream_type === "mp4") {
              player.setStreamData({ qualities: [{ quality: "Auto", url: s.stream_url }] });
              player.setLoadingStream(false);
              setStatusText("");
              await new Promise(r => setTimeout(r, 100));
              if (videoRef.current) {
                videoRef.current.src = s.stream_url;
                videoRef.current.play().catch(() => {});
              }
              return;
            }
            player.setMasterUrl(s.stream_url);
            player.setStreamData({ qualities: [{ quality: "Auto", url: s.stream_url }] });
            player.setLoadingStream(false);
            setStatusText("");
            return;
          }
        }
      } catch {}

      player.setLoadingStream(false);
      setStatusText("");
      player.setError("Streaming is temporarily unavailable. Try again later.");
    }
  }, [tryGogoanime, tryAnitsu, tryHindi, fetchSubtitlesInBackground, audio]);

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
          <div className="absolute inset-0 animate-pulse bg-void">
            <div className="h-full w-full bg-gradient-to-r from-void via-surface-hi/30 to-void" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-primary-400/30 border-t-primary-400 animate-spin" />
              {statusText && (
                <span className="text-[11px] font-medium text-mist">{statusText}</span>
              )}
            </div>
          </div>
        ) : player.streamData ? (
          <>
            <VideoAdOverlay
              key={`ad-${currentEp}-${audio}`}
              id="monetag-ad-overlay"
                src="https://omg10.com/4/11482825"
              show={true}
            />
            <video ref={videoRef} className="h-full w-full" controls playsInline controlsList="nofullscreen" crossOrigin="anonymous" />
            {player.playerStatus === "buffering" && !player.error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary-400" style={{ animationDelay: "0ms" }} />
                    <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary-400" style={{ animationDelay: "150ms" }} />
                    <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary-400" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[10px] font-medium text-white/60">Buffering</span>
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
            {resumeInfo && (
              <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/80 px-3.5 py-2 shadow-xl backdrop-blur-sm animate-[slideUp_0.2s_ease-out]">
                <span className="flex items-center gap-1.5 text-xs text-white/90">
                  <Play className="h-3 w-3 text-primary-400" />
                  Resumed from {fmtTime(resumeInfo.time)}
                </span>
                <button
                  onClick={applyResume}
                  className="rounded-full bg-primary-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-primary-500"
                >
                  Resume
                </button>
                <button
                  onClick={startOver}
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/20"
                >
                  Start over
                </button>
              </div>
            )}
            {showSkipOutro ? (
              <button
                onClick={skipOutro}
                className="absolute bottom-20 right-3 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90 animate-[slideUp_0.2s_ease-out]"
              >
                Skip Outro
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            ) : showSkipIntro ? (
              <button
                onClick={skipIntro}
                className="absolute bottom-20 right-3 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90 animate-[slideUp_0.2s_ease-out]"
              >
                Skip Intro
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            ) : null}
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
          {(["sub", "dub", "hindi"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => { if (opt !== audio) { setAudio(opt); } }}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0",
                audio === opt ? "bg-primary-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/20"
              )}
            >
              {opt === "sub" ? "Sub" : opt === "dub" ? "English" : "Hindi"}
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
        {(["sub", "dub", "hindi"] as const).map((opt) => (
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
            {opt === "sub" ? "Sub" : opt === "dub" ? "English" : "Hindi"}
          </button>
        ))}
        <button
          onClick={() => {
            const audioParam = audio === "hindi" ? "sub" : audio;
            window.location.href = `/download/${slug}?ep=${currentEp}&audio=${audioParam}`;
          }}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-white/5 text-mist hover:bg-white/10 transition"
        >
          <Download className="h-3 w-3" />
          Download
        </button>
      </div>

      {!isTheater && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-mist/60">Server</span>
          {(["auto", "anitsu", "gogoanime", "hindi"] as ServerPref[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setServerPref(s);
                try { localStorage.setItem("anibinge_server_pref", s); } catch { /* ignore */ }
              }}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                serverPref === s
                  ? "bg-primary-600 text-white"
                  : "bg-white/5 text-mist hover:bg-white/10"
              )}
            >
              <Monitor className="h-3 w-3" />
              {s === "auto" ? "Auto" : s === "anitsu" ? "Anivexa" : s === "gogoanime" ? "GogoAnime" : "Hindi"}
            </button>
          ))}
        </div>
      )}

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

              {showEpisodes && (() => {
                const watchedSet = new Set(loadHistory(historyScope).find((e) => e.slug === slug)?.watchedEps ?? []);
                return (
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
                          "relative flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-xs font-mono font-medium transition",
                          ep === currentEp
                            ? "bg-primary-600 text-white"
                            : watchedSet.has(ep)
                              ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-white/5 text-mist hover:bg-white/10"
                        )}
                      >
                        {ep}
                        {watchedSet.has(ep) && ep !== currentEp && (
                          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                );
              })()}
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

      <InjectedAdScript
        id="anibinge-ad-player"
        src="https://omg10.com/4/11482825"
      />
    </div>
  );
}
