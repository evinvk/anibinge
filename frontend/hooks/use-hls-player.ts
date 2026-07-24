"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface StreamSource {
  quality: string;
  url: string;
}

interface StreamData {
  qualities: StreamSource[];
}

export type PlayerStatus = "idle" | "buffering" | "playing" | "error";

export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onLoadSubtitles: () => void,
  onFatalError?: (errorType: string) => void,
) {
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const hlsRef = useRef<any>(null);
  const sourceRef = useRef<"gogoanime" | "anivexa" | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const onFatalErrorRef = useRef(onFatalError);
  const onLoadSubtitlesRef = useRef(onLoadSubtitles);
  const loadGenRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaErrorRetryRef = useRef(0);
  const freezeRecoveryRef = useRef(0);
  onFatalErrorRef.current = onFatalError;
  onLoadSubtitlesRef.current = onLoadSubtitles;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let lastTime = video.currentTime;
    let lastTimeChange = Date.now();
    let rafId: number;
    const checkFreeze = () => {
      if (!video || video.paused || video.ended || video.readyState < 2) {
        lastTime = video.currentTime;
        lastTimeChange = Date.now();
        rafId = requestAnimationFrame(checkFreeze);
        return;
      }
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastTimeChange = Date.now();
        freezeRecoveryRef.current = 0;
      } else if (Date.now() - lastTimeChange > 4000) {
        const buffered = video.buffered;
        let seeked = false;
        for (let i = 0; i < buffered.length; i++) {
          if (video.currentTime >= buffered.start(i) && video.currentTime < buffered.end(i)) {
            const ahead = buffered.end(i) - video.currentTime;
            if (ahead > 1) {
              video.currentTime = buffered.end(i) - 0.5;
              seeked = true;
              freezeRecoveryRef.current++;
            }
            break;
          }
        }
        if (!seeked && buffered.length > 0) {
          const lastEnd = buffered.end(buffered.length - 1);
          if (lastEnd > video.currentTime) {
            video.currentTime = lastEnd - 0.5;
            seeked = true;
            freezeRecoveryRef.current++;
          }
        }
        lastTimeChange = Date.now();
        if (freezeRecoveryRef.current >= 5) {
          freezeRecoveryRef.current = 0;
          if (onFatalErrorRef.current) {
            onFatalErrorRef.current("videoFreeze");
          }
        }
      }
      rafId = requestAnimationFrame(checkFreeze);
    };
    rafId = requestAnimationFrame(checkFreeze);

    const onPlay = () => {
      setPlayerStatus("playing");
      lastTime = video.currentTime;
      lastTimeChange = Date.now();
    };
    const onPause = () => {};
    const onWaiting = () => setPlayerStatus("buffering");
    const onPlaying = () => {
      setPlayerStatus("playing");
      mediaErrorRetryRef.current = 0;
      lastTime = video.currentTime;
      lastTimeChange = Date.now();
    };
    const onCanPlay = () => {
      setPlayerStatus("playing");
    };
    const onStalled = () => {
      setPlayerStatus("buffering");
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        if (!video || video.paused || video.ended) return;
        const currentTime = video.currentTime;
        const buffered = video.buffered;
        if (buffered.length > 0) {
          for (let i = 0; i < buffered.length; i++) {
            if (currentTime >= buffered.start(i) && currentTime < buffered.end(i)) {
              const ahead = buffered.end(i) - currentTime;
              if (ahead < 1) {
                video.currentTime = buffered.end(i) - 0.1;
              }
              return;
            }
          }
          for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) > currentTime) {
              video.currentTime = buffered.start(i) - 0.1;
              return;
            }
          }
        }
      }, 3000);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("stalled", onStalled);
    return () => {
      cancelAnimationFrame(rafId);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("stalled", onStalled);
    };
  });

  const loadPlayer = useCallback(async (url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    setPlayerStatus("buffering");
    mediaErrorRetryRef.current = 0;

    const gen = ++loadGenRef.current;
    const Hls = (await import("hls.js")).default;
    if (gen !== loadGenRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1,
        capLevelToPlayerSize: true,
        maxBufferHole: 1.0,
        stretchShortVideoTrack: true,
        backBufferLength: 0,
        maxSeekHole: 2.0,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        setSelectedQuality(-1);
        video.play().catch(() => {
          setPlayerStatus("error");
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_: any, data: any) => {
        if (hls.autoLevelEnabled) {
          setSelectedQuality(-1);
        } else {
          setSelectedQuality(data.level);
        }
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        setPlayerStatus("playing");
      });

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("[HLS] Network error, retrying...", data.details);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              mediaErrorRetryRef.current++;
              if (mediaErrorRetryRef.current < 3) {
                console.error("[HLS] Media error, recovering...", data.details);
                hls.recoverMediaError();
              } else {
                setPlayerStatus("error");
                if (onFatalErrorRef.current) {
                  onFatalErrorRef.current(data.type);
                } else {
                  setError("Playback error: " + data.type);
                }
              }
              break;
            default:
              setPlayerStatus("error");
              if (onFatalErrorRef.current) {
                onFatalErrorRef.current(data.type);
              } else {
                setError("Playback error: " + data.type);
              }
              break;
          }
        } else {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setPlayerStatus("buffering");
          }
        }
      });

      onLoadSubtitlesRef.current();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {
          setPlayerStatus("error");
        });
      }, { once: true });
      video.addEventListener("waiting", () => setPlayerStatus("buffering"));
      video.addEventListener("playing", () => setPlayerStatus("playing"));
      onLoadSubtitlesRef.current();
    } else {
      setError("HLS is not supported in this browser");
      setPlayerStatus("error");
    }
  }, [videoRef]);

  function setQuality(index: number) {
    const hls = hlsRef.current;
    if (!hls) return;
    setSelectedQuality(index);
    if (index === -1) {
      hls.currentLevel = -1;
    } else {
      hls.currentLevel = index;
    }
  }

  function destroyHls() {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  function resetPlayer() {
    destroyHls();
    setStreamData(null);
    setMasterUrl(null);
    setSelectedQuality(-1);
    setPlayerStatus("idle");
    sourceRef.current = null;
    fallbackAttemptedRef.current = false;
  }

  return {
    streamData,
    setStreamData,
    masterUrl,
    setMasterUrl,
    selectedQuality,
    loadingStream,
    setLoadingStream,
    error,
    setError,
    playerStatus,
    setPlayerStatus,
    hlsRef,
    sourceRef,
    fallbackAttemptedRef,
    loadPlayer,
    setQuality,
    resetPlayer,
    destroyHls,
  };
}
