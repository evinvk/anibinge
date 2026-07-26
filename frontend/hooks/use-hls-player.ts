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
  const [levels, setLevels] = useState<any[]>([]);
  const hlsRef = useRef<any>(null);
  const sourceRef = useRef<"gogoanime" | "anitsu" | "anivexa" | "wibu" | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const onFatalErrorRef = useRef(onFatalError);
  const onLoadSubtitlesRef = useRef(onLoadSubtitles);
  const loadGenRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaErrorRetryRef = useRef(0);
  const freezeRecoveryRef = useRef(0);
  const bufferingStartRef = useRef(0);
  const consecutive410Ref = useRef(0);
  onFatalErrorRef.current = onFatalError;
  onLoadSubtitlesRef.current = onLoadSubtitles;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let lastTime = video.currentTime;
    let lastTimeChange = Date.now();
    let lastVideoFrameTime = Date.now();
    let rafId: number;
    const onVFrame = () => {
      lastVideoFrameTime = Date.now();
      try { video.requestVideoFrameCallback(onVFrame); } catch {}
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(onVFrame);
    }

    const checkFreeze = () => {
      if (!video || video.paused || video.ended || video.readyState < 2 || isSeekingRef.current) {
        lastTime = video.currentTime;
        lastTimeChange = Date.now();
        bufferingStartRef.current = 0;
        // Safety: if seeking stuck for >15s, unfreeze so detection can run
        if (isSeekingRef.current && seekingStartedRef.current && Date.now() - seekingStartedRef.current > 15000) {
          isSeekingRef.current = false;
        } else {
          rafId = requestAnimationFrame(checkFreeze);
          return;
        }
      }
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastTimeChange = Date.now();
        freezeRecoveryRef.current = 0;
        // Video frame not rendering while time advances → audio-only playback
        if (Date.now() - lastVideoFrameTime > 2000) {
          lastVideoFrameTime = Date.now();
          if (onFatalErrorRef.current) {
            onFatalErrorRef.current("videoFreeze");
          }
        }
      } else if (Date.now() - lastTimeChange > 2000) {
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
        if (freezeRecoveryRef.current >= 3) {
          freezeRecoveryRef.current = 0;
          if (onFatalErrorRef.current) {
            onFatalErrorRef.current("videoFreeze");
          }
        }
      }
      if (bufferingStartRef.current > 0 && Date.now() - bufferingStartRef.current > 8000) {
        bufferingStartRef.current = 0;
        if (onFatalErrorRef.current) {
          onFatalErrorRef.current("videoFreeze");
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
    const isSeekingRef = { current: false };
    const seekingStartedRef = { current: 0 };
    const onSeeking = () => {
      isSeekingRef.current = true;
      seekingStartedRef.current = Date.now();
      bufferingStartRef.current = 0;
      freezeRecoveryRef.current = 0;
    };
    const onSeeked = () => {
      lastTime = video.currentTime;
      lastTimeChange = Date.now();
    };
    const onWaiting = () => {
      setPlayerStatus("buffering");
      if (!isSeekingRef.current && !bufferingStartRef.current) {
        bufferingStartRef.current = Date.now();
      }
    };
    const onPlaying = () => {
      setPlayerStatus("playing");
      isSeekingRef.current = false;
      bufferingStartRef.current = 0;
      mediaErrorRetryRef.current = 0;
      consecutive410Ref.current = 0;
      lastTime = video.currentTime;
      lastTimeChange = Date.now();
      lastVideoFrameTime = Date.now();
      if (typeof video.requestVideoFrameCallback === "function") {
        try { video.requestVideoFrameCallback(onVFrame); } catch {}
      }
    };
    const onCanPlay = () => {
      setPlayerStatus("playing");
      bufferingStartRef.current = 0;
    };
    const onStalled = () => {
      setPlayerStatus("buffering");
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        if (!video || video.paused || video.ended || isSeekingRef.current) return;
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
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("stalled", onStalled);
    return () => {
      cancelAnimationFrame(rafId);
      bufferingStartRef.current = 0;
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
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
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        setSelectedQuality(-1);
        setLevels(hls.levels ? [...hls.levels] : []);
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
              if (data.response?.code === 410 || data.response?.code === 404) {
                setPlayerStatus("error");
                if (onFatalErrorRef.current) {
                  onFatalErrorRef.current(data.type);
                } else {
                  setError("Playback error: " + data.type);
                }
              } else {
                console.error("[HLS] Network error, retrying...", data.details);
                hls.startLoad();
              }
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
            // 410 on non-fatal = segment permanently deleted, skip ahead or fallback
            if (data.response?.code === 410) {
              consecutive410Ref.current++;
              if (consecutive410Ref.current >= 3) {
                consecutive410Ref.current = 0;
                setPlayerStatus("error");
                if (onFatalErrorRef.current) {
                  onFatalErrorRef.current("networkError");
                }
              } else {
                // Try to skip ahead past the deleted segment
                const video = videoRef.current;
                if (video && video.buffered.length > 0) {
                  for (let i = 0; i < video.buffered.length; i++) {
                    if (video.buffered.start(i) > video.currentTime) {
                      video.currentTime = video.buffered.start(i);
                      break;
                    }
                  }
                }
              }
            } else {
              consecutive410Ref.current = 0;
              setPlayerStatus("buffering");
            }
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
    setLevels([]);
  }

  function resetPlayer() {
    destroyHls();
    setStreamData(null);
    setMasterUrl(null);
    setSelectedQuality(-1);
    setLevels([]);
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
    levels,
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
