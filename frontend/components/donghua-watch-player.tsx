"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Server, SkipForward, Play } from "lucide-react";
import { api, type DonghuaStreamData, type DonghuaServer } from "@/lib/api";
import { EpisodeComments } from "@/components/episode-comments";
import { InjectedAdScript } from "@/components/injected-ad-script";
import { VideoAdOverlay } from "@/components/video-ad-overlay";
import { getSkipTimes, recordSkipIntro, recordSkipOutro, DEFAULT_INTRO_START, DEFAULT_INTRO_LENGTH, DEFAULT_OUTRO_LENGTH } from "@/lib/skip-intro";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  const router = useRouter();
  const initialEp = parseInt(searchParams.get("ep") || "1", 10) || 1;

  const [title, setTitle] = useState<string>("");
  const [currentEp, setCurrentEp] = useState(initialEp);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [servers, setServers] = useState<DonghuaServer[]>([]);
  const [activeServer, setActiveServer] = useState(0);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  const lastSkipStateRef = useRef({ intro: false, outro: false });
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [nextEpCountdown, setNextEpCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [audio, setAudio] = useState<"sub" | "hindi">("sub");
  const [isHindiStream, setIsHindiStream] = useState(false);
  const resolvedAnilistRef = useRef<number | null>(null);

  useEffect(() => {
    api.donghuaDetail(slug).then((r) => {
      setTitle(r.data.title);
      setTotalEps(r.data.episodes || r.data.episode_list?.length || null);
    }).catch(() => {});
  }, [slug]);

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

  const tryResolveEmbed = useCallback(async (url: string): Promise<string | null> => {
    if (/dailymotion\.com|dai\.ly/i.test(url)) return url;
    try {
      const resp = await fetch(`/api/v1/streaming/donghua/resolve-embed?url=${encodeURIComponent(url)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.data?.stream_url || null;
    } catch {
      return null;
    }
  }, []);

  const tryHindi = useCallback(async (ep: number): Promise<boolean> => {
    setError(null);
    setLoadingStream(true);
    setStreamUrl(null);
    try {
      const aid = resolvedAnilistRef.current;
      if (!aid) return false;
      const data = await api.hindiStream(aid, ep).catch(() => null);
      if (data?.stream_url) {
        const proxiedUrl = `/api/proxy?url=${encodeURIComponent(data.stream_url)}&referer=${encodeURIComponent(data.referer || "https://rubystm.com/")}`;
        setIsHindiStream(true);
        setStreamUrl(proxiedUrl);
        setLoadingStream(false);
        return true;
      }
    } catch {}
    setIsHindiStream(false);
    setLoadingStream(false);
    return false;
  }, []);

  const fetchStream = useCallback(async (ep: number) => {
    setLoadingStream(true);
    setError(null);
    setServers([]);
    setStreamUrl(null);
    setIsHindiStream(false);

    if (audio === "hindi") {
      const ok = await tryHindi(ep);
      if (ok) return;
    }

    const streamData = await api.donghuaStream(slug, ep).then(r => r.data).catch(() => null);

    if (streamData?.servers?.length) {
      setServers(streamData.servers);
      setActiveServer(0);
      setLoadingStream(false);

      const first = streamData.servers[0];
      if (isEmbedUrl(first.stream_url)) {
        const direct = await tryResolveEmbed(first.stream_url);
        setStreamUrl(direct || first.stream_url);
      } else {
        setStreamUrl(first.stream_url);
      }
    } else if (streamData?.stream_url) {
      setStreamUrl(streamData.stream_url);
      setLoadingStream(false);
    } else {
      setLoadingStream(false);
      setError("No streaming sources found for this episode.");
    }
  }, [slug, tryResolveEmbed, tryHindi, audio]);

  useEffect(() => {
    fetchStream(currentEp);
  }, [currentEp, fetchStream]);

  const handleServerChange = async (idx: number) => {
    if (!servers[idx]) return;
    setActiveServer(idx);
    const url = servers[idx].stream_url;
    if (isEmbedUrl(url)) {
      const resolved = await tryResolveEmbed(url);
      setStreamUrl(resolved || url);
    } else {
      setStreamUrl(url);
    }
  };

  const goToEpisode = (ep: number) => {
    if (ep < 1) return;
    setCurrentEp(ep);
    router.replace(`/donghua/watch/${slug}?ep=${ep}`, { scroll: false });
  };

  const resolvedUrl = (() => {
    if (!streamUrl) return null;
    if (streamUrl.startsWith("//")) return `https:${streamUrl}`;
    return streamUrl;
  })();

  const isHls = isHindiStream || (resolvedUrl ? /\.m3u8/i.test(resolvedUrl) : false);
  const isDirectVideo = resolvedUrl ? isHls || /\.(mp4|webm)(\?|$)/i.test(resolvedUrl) || resolvedUrl.includes("video-proxy") || resolvedUrl.startsWith("/api/proxy") : false;

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
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    const onTime = () => {
      const t = video.currentTime;
      const d = video.duration || 0;
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

    const onEnded = () => {
      if (!autoPlayNext) return;
      const next = currentEp + 1;
      if (totalEps && next > totalEps) return;
      setNextEpCountdown(5);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        setNextEpCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            goToEpisode(next);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
    };
  }, [streamUrl, slug, currentEp, totalEps, autoPlayNext, goToEpisode]);

  useEffect(() => {
    return () => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };
  }, []);

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

        {/* Audio selector */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-mist">Audio</span>
          <div className="flex gap-1 rounded-lg bg-white/5 p-1">
            {(["sub", "hindi"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => { if (opt !== audio) setAudio(opt); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  audio === opt ? "bg-red-500 text-white" : "text-mist hover:text-paper"
                }`}
              >
                {opt === "sub" ? "Sub" : "Hindi"}
              </button>
            ))}
          </div>
        </div>

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
          ) : isDirectVideo && resolvedUrl ? (
            <>
              <VideoAdOverlay
                key={`ad-${currentEp}`}
                id="monetag-ad-overlay"
                src="https://omg10.com/4/11482825"
                show={true}
              />
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
              {nextEpCountdown > 0 && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80">
                  <p className="text-lg font-semibold text-white">Next episode in {nextEpCountdown}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                        countdownTimerRef.current = null;
                        setNextEpCountdown(0);
                        goToEpisode(currentEp + 1);
                      }}
                      className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-400"
                    >
                      <Play className="h-3 w-3" />
                      Play now
                    </button>
                    <button
                      onClick={() => {
                        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                        countdownTimerRef.current = null;
                        setNextEpCountdown(0);
                        setAutoPlayNext(false);
                      }}
                      className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : resolvedUrl ? (
            <>
              <VideoAdOverlay
                key={`ad-${currentEp}`}
                id="monetag-ad-overlay"
                src="https://omg10.com/4/11482825"
                show={true}
              />
              <div className="absolute inset-0 flex flex-col">
              <iframe
                key={resolvedUrl}
                src={resolvedUrl}
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
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
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-mist">No stream available</p>
            </div>
          )}
        </div>

        {/* Server selector */}
        {servers.length > 1 && audio !== "hindi" && (
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
        <div className="mt-6 flex items-center justify-between gap-2">
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

        <div className="mt-3">
          <button
            onClick={() => setAutoPlayNext((p) => !p)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
              autoPlayNext
                ? "bg-red-500/20 text-red-300"
                : "bg-white/5 text-mist hover:bg-white/10"
            }`}
          >
            <Play className={`h-3 w-3 ${!autoPlayNext && "opacity-50"}`} />
            {autoPlayNext ? "Auto-play on" : "Auto-play off"}
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

      <InjectedAdScript
        id="anibinge-ad-player"
        src="https://omg10.com/4/11482825"
      />
    </div>
  );
}
