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
  onMediaEnded?: () => void,
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
  const onMediaEndedRef = useRef(onMediaEnded);
  const loadGenRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaErrorRetryRef = useRef(0);
  const networkErrorRetryRef = useRef(0);
  const consecutive410Ref = useRef(0);
  onFatalErrorRef.current = onFatalError;
  onLoadSubtitlesRef.current = onLoadSubtitles;
  onMediaEndedRef.current = onMediaEnded;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastTime = video.currentTime;
    let lastTimeStamp = Date.now();
    let stallCheckId: ReturnType<typeof setInterval> | null = null;
    let frameCallbackId: number | null = null;
    let lastVideoFrameStamp = Date.now();
    let videoFreezeRecoveries = 0;
    let stallRecoveries = 0;

    const watchVideoFrames = () => {
      if (typeof video.requestVideoFrameCallback !== "function" || frameCallbackId !== null) return;
      const onFrame = () => {
        lastVideoFrameStamp = Date.now();
        videoFreezeRecoveries = 0;
        frameCallbackId = video.requestVideoFrameCallback(onFrame);
      };
      frameCallbackId = video.requestVideoFrameCallback(onFrame);
    };

    const stopWatchingVideoFrames = () => {
      if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      frameCallbackId = null;
    };

    const startStallCheck = () => {
      if (stallCheckId) return;
      stallCheckId = setInterval(() => {
        if (!video || video.paused || video.ended || video.readyState < 2) {
          lastTime = video?.currentTime ?? lastTime;
          lastTimeStamp = Date.now();
          return;
        }
        if (video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          lastTimeStamp = Date.now();
          videoFreezeRecoveries = 0;
          if (
            typeof video.requestVideoFrameCallback === "function" &&
            video.videoWidth > 0 &&
            document.visibilityState === "visible" &&
            Date.now() - lastVideoFrameStamp > 8000
          ) {
            lastVideoFrameStamp = Date.now();
            videoFreezeRecoveries++;
            const hls = hlsRef.current;
            if (videoFreezeRecoveries === 1 && hls) {
              try { hls.recoverMediaError(); } catch {}
            } else if (videoFreezeRecoveries >= 3) {
              videoFreezeRecoveries = 0;
              if (onFatalErrorRef.current) onFatalErrorRef.current("videoFreeze");
            }
          }
          return;
        }
        if (Date.now() - lastTimeStamp > 5000) {
          lastTimeStamp = Date.now();
          const buffered = video.buffered;
          for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i);
            const end = buffered.end(i);
            if (video.currentTime >= start && video.currentTime < end) {
              const ahead = end - video.currentTime;
              if (ahead > 0.5) {
                video.currentTime = video.currentTime + 0.1;
              }
              break;
            }
            if (start > video.currentTime + 0.5) {
              video.currentTime = start;
              break;
            }
            // No buffered data at all — HLS.js should still be fetching.
          }

          // currentTime hasn't moved in >4s no matter what we tried above,
          // so this same branch will fire again next tick if it's a real
          // freeze. Escalate instead of nudging/waiting forever: try HLS's
          // own media-error recovery once, then switch streaming providers
          // entirely if that still doesn't unstick it.
          stallRecoveries++;
          if (stallRecoveries === 1) {
            const hls = hlsRef.current;
            if (hls) {
              try { hls.recoverMediaError(); } catch {}
            }
          } else if (stallRecoveries >= 3) {
            stallRecoveries = 0;
            onFatalErrorRef.current?.("stalled");
          }
        }
      }, 1000);
    };

    const stopStallCheck = () => {
      if (stallCheckId) {
        clearInterval(stallCheckId);
        stallCheckId = null;
      }
    };

    const onPlay = () => {
      setPlayerStatus("playing");
      lastTime = video.currentTime;
      lastTimeStamp = Date.now();
      watchVideoFrames();
      startStallCheck();
    };
    const onPause = () => {
      stopStallCheck();
    };
    const onSeeking = () => {
      lastTime = video.currentTime;
      lastTimeStamp = Date.now();
    };
    const onSeeked = () => {
      lastTime = video.currentTime;
      lastTimeStamp = Date.now();
    };
    const onWaiting = () => {
      setPlayerStatus("buffering");
      lastTime = video.currentTime;
      lastTimeStamp = Date.now();
    };
    const onPlaying = () => {
      setPlayerStatus("playing");
      lastTime = video.currentTime;
      lastTimeStamp = Date.now();
      mediaErrorRetryRef.current = 0;
      networkErrorRetryRef.current = 0;
      consecutive410Ref.current = 0;
      watchVideoFrames();
      startStallCheck();
    };
    const onCanPlay = () => {
      setPlayerStatus("playing");
    };
    const onStalled = () => {
      setPlayerStatus("buffering");
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        if (!video || video.paused || video.ended) return;
        const hls = hlsRef.current;
        if (hls) {
          try { hls.startLoad(); } catch {}
        }
      }, 3000);
    };
    const onEnded = () => {
      stopStallCheck();
      if (onMediaEndedRef.current) onMediaEndedRef.current();
    };
    const onError = () => {
      setPlayerStatus("error");
      setError("Playback error: mediaError");
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    return () => {
      stopStallCheck();
      stopWatchingVideoFrames();
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [videoRef.current]);

  const loadPlayer = useCallback(async (url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    setPlayerStatus("buffering");
    mediaErrorRetryRef.current = 0;
    networkErrorRetryRef.current = 0;

    const gen = ++loadGenRef.current;
    const Hls = (await import("hls.js")).default;
    if (gen !== loadGenRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 10,
        startLevel: -1,
        capLevelToPlayerSize: false,
        maxBufferHole: 0.3,
        stretchShortVideoTrack: false,
        nudgeMaxRetry: 5,
        nudgeOffset: 0.1,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 15000,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        setSelectedQuality(-1);
        setLevels(hls.levels ? [...hls.levels] : []);
        networkErrorRetryRef.current = 0;
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

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.response?.code === 410 || data.response?.code === 404) {
                networkErrorRetryRef.current++;
                if (networkErrorRetryRef.current < 3) {
                  setTimeout(() => { try { hls.startLoad(); } catch {} }, 1000);
                } else {
                  networkErrorRetryRef.current = 0;
                  setPlayerStatus("error");
                  if (onFatalErrorRef.current) {
                    onFatalErrorRef.current("networkError");
                  } else {
                    setError("Playback error: networkError");
                  }
                }
              } else {
                networkErrorRetryRef.current++;
                if (networkErrorRetryRef.current < 4) {
                  setTimeout(() => { try { hls.startLoad(); } catch {} }, 750);
                } else {
                  networkErrorRetryRef.current = 0;
                  setPlayerStatus("error");
                  if (onFatalErrorRef.current) {
                    onFatalErrorRef.current("networkError");
                  } else {
                    setError("Playback error: networkError");
                  }
                }
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              mediaErrorRetryRef.current++;
              if (mediaErrorRetryRef.current < 4) {
                try { hls.recoverMediaError(); } catch {}
              } else {
                setPlayerStatus("error");
                if (onFatalErrorRef.current) {
                  onFatalErrorRef.current("mediaError");
                } else {
                  setError("Playback error: mediaError");
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
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code === 410) {
            consecutive410Ref.current++;
            if (consecutive410Ref.current >= 5) {
              consecutive410Ref.current = 0;
              if (onFatalErrorRef.current) {
                onFatalErrorRef.current("networkError");
              }
            }
          } else {
            consecutive410Ref.current = 0;
          }
        }
      });

      if (onLoadSubtitlesRef.current) onLoadSubtitlesRef.current();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => setPlayerStatus("error"));
      }, { once: true });
      if (onLoadSubtitlesRef.current) onLoadSubtitlesRef.current();
    } else {
      setError("HLS is not supported in this browser");
      setPlayerStatus("error");
    }
  }, [videoRef]);

  function setQuality(index: number) {
    const hls = hlsRef.current;
    if (!hls) return;
    setSelectedQuality(index);
    hls.currentLevel = index;
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
    networkErrorRetryRef.current = 0;
    mediaErrorRetryRef.current = 0;
    consecutive410Ref.current = 0;
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
