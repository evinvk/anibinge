"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Monitor } from "lucide-react";
import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import clsx from "clsx";

interface SearchResult {
  slug: string;
  title: string;
  poster: string | null;
  episodes_count: number | null;
  score: string | null;
  type: string | null;
}

interface StreamSource {
  quality: string;
  url: string;
}

interface Subtitle {
  file: string;
  label: string;
  language: string;
  kind: string;
  default: boolean;
  source: string;
  referer: string;
}

interface StreamData {
  qualities: StreamSource[];
}

interface StreamingPlayerProps {
  animeTitle: string;
  anilistId?: number;
}

export function StreamingPlayer({ animeTitle, anilistId }: StreamingPlayerProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const subtitlesRef = useRef<Subtitle[]>([]);
  const resolvedAnilistRef = useRef<number | null>(anilistId ?? null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    searchAnime();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [animeTitle]);

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
    if (masterUrl && videoRef.current) {
      loadPlayer(masterUrl);
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [masterUrl]);

  const [source, setSource] = useState<"gogoanime" | "anivexa" | null>(null);
  const fallbackAttemptedRef = useRef(false);

  const loadAnivexaFallback = useCallback(async (ep: number) => {
    let aid = resolvedAnilistRef.current;
    // If no ID yet, try to resolve now
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
        const proxiedSubs = (res.subtitles || []).map((s: Subtitle) => {
          let proxyUrl = `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(s.file)}`;
          if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
          return { ...s, file: proxyUrl };
        });
        subtitlesRef.current = proxiedSubs;
        setSubtitles(proxiedSubs);
        const masterUrlFull = `${API_BASE}/api/v1/streaming/anivexa/${aid}/master?ep=${ep}`;
        setSource("anivexa");
        setMasterUrl(masterUrlFull);
        setStreamData({ qualities: [{ quality: "auto", url: masterUrlFull }] });
        setLoadingStream(false);
        return true;
      }
    } catch { /* fallback failed */ }
    return false;
  }, [animeTitle]);

  const loadStream = useCallback(async (slug: string, ep: number) => {
    setLoadingStream(true);
    setError(null);
    setStreamData(null);
    setMasterUrl(null);
    setSelectedQuality(0);
    setSubtitles([]);
    subtitlesRef.current = [];
    fallbackAttemptedRef.current = false;

    let aid = resolvedAnilistRef.current;
    // If anilist ID not resolved yet, try to resolve it now
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

    // Fetch subtitles and GogoAnime stream in parallel
    const subsPromise = aid
      ? fetch(`${API_BASE}/api/v1/streaming/anivexa/${aid}/stream?ep=${ep}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      : Promise.resolve(null);

    const [gogoRes, subsData] = await Promise.all([
      api.gogoanimeStream(slug, ep).catch(() => null),
      subsPromise,
    ]);

    // Store subtitles before player loads
    if (subsData?.subtitles?.length) {
      const proxiedSubs: Subtitle[] = subsData.subtitles.map((s: Subtitle) => {
        let proxyUrl = `${API_BASE}/api/v1/streaming/anivexa/subtitle?url=${encodeURIComponent(s.file)}`;
        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
        return { ...s, file: proxyUrl };
      });
      subtitlesRef.current = proxiedSubs;
      setSubtitles(proxiedSubs);
    }

    const data = gogoRes?.data;
    if (data?.qualities) {
      setSource("gogoanime");
      setStreamData({ qualities: data.qualities });
      setMasterUrl(api.gogoanimeMaster(slug, ep));
      setLoadingStream(false);
      return;
    }

    // GogoAnime unavailable, try Anivexa directly
    fallbackAttemptedRef.current = true;
    const ok = await loadAnivexaFallback(ep);
    if (!ok) {
      setError("No streaming sources available for this episode");
      setLoadingStream(false);
    }
  }, [animeTitle, loadAnivexaFallback]);

  useEffect(() => {
    if (selectedSlug && currentEp) {
      loadStream(selectedSlug, currentEp);
    }
  }, [selectedSlug, currentEp, loadStream]);

  async function searchAnime() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.gogoanimeSearch(animeTitle);
      setResults(res.data || []);
      if (res.data?.length > 0) {
        setSelectedSlug(res.data[0].slug);
        setTotalEps(res.data[0].episodes_count || null);
      } else {
        setError("This anime is not available for streaming");
      }
    } catch {
      setError("Failed to search for streaming sources");
    } finally {
      setLoading(false);
    }

    // Resolve AniList ID if not provided
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
  }

  function parseVttTime(time: string): number {
    const parts = time.trim().split(":");
    if (parts.length === 3) {
      const [h, m, rest] = parts;
      return Number(h) * 3600 + Number(m) * 60 + parseFloat(rest);
    } else if (parts.length === 2) {
      const [m, rest] = parts;
      return Number(m) * 60 + parseFloat(rest);
    }
    return parseFloat(parts[0]) || 0;
  }

  async function loadSubtitlesOntoVideo(video: HTMLVideoElement, subs: Subtitle[]) {
    if (!subs.length) return;
    for (const sub of subs) {
      try {
        const resp = await fetch(sub.file);
        if (!resp.ok) continue;
        const vttText = await resp.text();
        const track = video.addTextTrack("captions", sub.label, sub.language);
        // Parse VTT: split into cue blocks separated by blank lines
        const blocks = vttText.split(/\r?\n\r?\n/);
        for (const block of blocks) {
          const lines = block.trim().split(/\r?\n/);
          const timeLine = lines.find((l) => l.includes("-->"));
          if (!timeLine) continue;
          const timeMatch = timeLine.match(
            /(\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3}/
          );
          if (!timeMatch) continue;
          const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
          const cueLines = lines.filter((l) => l !== timeLine && !l.match(/^\d+$/));
          const text = cueLines.join("\n").replace(/<[^>]+>/g, "");
          const cue = new VTTCue(parseVttTime(startStr), parseVttTime(endStr), text);
          track.addCue(cue);
        }
        if (sub.default) track.mode = "showing";
      } catch {
        // Subtitle failed to load — skip silently
      }
    }
    // Enable all text tracks that have cues
    for (let i = 0; i < video.textTracks.length; i++) {
      if (video.textTracks[i].cues && video.textTracks[i].cues!.length > 0) {
        video.textTracks[i].mode = "showing";
      }
    }
  }

  async function loadPlayer(url: string) {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    const Hls = (await import("hls.js")).default;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        if (data.levels?.length > 1) {
          hls.currentLevel = 0;
        }
        video.play().catch(() => {});
      });
      // Add external subtitles: fetch VTT content, create Blob URLs to bypass MSE CORS issues
      loadSubtitlesOntoVideo(video, subtitlesRef.current);
      hls.on(Hls.Events.ERROR, async (_: any, data: any) => {
        if (data.fatal && source === "gogoanime" && !fallbackAttemptedRef.current && resolvedAnilistRef.current) {
          // GogoAnime CDN is broken — try Anivexa fallback
          fallbackAttemptedRef.current = true;
          hls.destroy();
          hlsRef.current = null;
          setLoadingStream(true);
          setError(null);
          const ok = await loadAnivexaFallback(currentEp);
          if (!ok) {
            setError("Streaming unavailable from all providers");
            setLoadingStream(false);
          }
        } else if (data.fatal) {
          setError("Playback error: " + data.type);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      loadSubtitlesOntoVideo(video, subtitlesRef.current);
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported in this browser");
    }
  }

  function setQuality(index: number) {
    setSelectedQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-mist">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Searching for streaming sources...</span>
      </div>
    );
  }

  if (error && results.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (results.length === 0 && !loading) {
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
        {loadingStream ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          </div>
        ) : streamData ? (
          <video
            ref={videoRef}
            className="h-full w-full"
            controls
            playsInline
          />
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mist">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mist text-sm">
            Select an episode to start watching
          </div>
        )}
      </div>

      {streamData && streamData.qualities.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {streamData.qualities.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuality(i)}
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
                selectedQuality === i
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
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => setCurrentEp((p) => Math.max(1, p - 1))}
            disabled={currentEp <= 1}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp <= 1
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </button>
          <span className="text-sm font-mono text-mist">
            Ep {currentEp} / {totalEps}
          </span>
          <button
            onClick={() => setCurrentEp((p) => Math.min(totalEps, p + 1))}
            disabled={currentEp >= totalEps}
            className={clsx(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              currentEp >= totalEps
                ? "cursor-not-allowed text-mist/40"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {error && !loadingStream && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </section>
  );
}
