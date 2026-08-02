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

function find720LevelIndex(levels: any[]): number {
  if (!levels || levels.length === 0) return -1;
  if (levels.length === 1) return 0;
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const h = levels[i]?.height || 0;
    const diff = Math.abs(h - 720);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  if (best === -1) {
    for (let i = 0; i < levels.length; i++) {
      const bw = levels[i]?.bitrate || levels[i]?.bandwidth || 0;
      const diff = Math.abs(bw - 2500000);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
  }
  return best;
}

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
  const sourceRef = useRef<"gogoanime" | "anitsu" | "anivexa" | "wibu" | "hindi" | null>(null);
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
    let audioOnlyFreezeQualityCycle = 0;

    const watchVideoFrames = () => {
      if (typeof video.requestVideoFrameCallback !== "function") return;
      frameCallbackId = video.requestVideoFrameCallback(function onFrame() {
        lastVideoFrameStamp = Date.now();
        videoFreezeRecoveries = 0;
        frameCallbackId = video.requestVideoFrameCallback(onFrame);
      });
    };

    const stopWatchingVideoFrames = () => {
      if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      frameCallbackId = null;
    };

    const qualityCycle = () => {
      const hls = hlsRef.current;
      if (!hls || !hls.levels || hls.levels.length < 2) return false;
      // Drop to lowest quality to reduce bandwidth demand
      const lowestLevel = hls.levels.length - 1;
      hls.nextLevel = lowestLevel;
      return true;
    };

    const startStallCheck = () => {
      if (stallCheckId) return;
      stallCheckId = setInterval(() => {
        if (!video || video.paused || video.ended || video.readyState < 2) {
          lastTime = video?.currentTime ?? lastTime;
          lastTimeStamp = Date.now();
          return;
        }

        const ct = video.currentTime;
        const now = Date.now();

        // --- Standard stall detection (currentTime not advancing) ---
        if (ct !== lastTime) {
          lastTime = ct;
          lastTimeStamp = now;
          videoFreezeRecoveries = 0;
          stallRecoveries = 0;

          // Cross-check: currentTime advanced but video frames might not be
          if (
            video.videoWidth > 0 &&
            document.visibilityState === "visible"
          ) {
            // Use requestVideoFrameCallback timestamp to detect video freeze
            const frameGap = now - lastVideoFrameStamp;
            if (frameGap > 3000) {
              lastVideoFrameStamp = now;
              videoFreezeRecoveries++;
              const hls = hlsRef.current;
              if (videoFreezeRecoveries === 1) {
                // Gentle: nudge currentTime to force frame decode
                try { video.currentTime = video.currentTime + 0.01; } catch {}
              } else if (videoFreezeRecoveries === 2) {
                // Medium: force hls.js to reload from buffer
                try { hls?.startLoad(); } catch {}
              } else if (videoFreezeRecoveries === 3) {
                // Aggressive: drop to lowest quality
                qualityCycle();
              } else if (videoFreezeRecoveries >= 4) {
                // Last resort: fatal error triggers source fallback
                videoFreezeRecoveries = 0;
                if (onFatalErrorRef.current) onFatalErrorRef.current("videoFreeze");
              }
            }
          }
          return;
        }

        // --- currentTime hasn't moved for >5s (both audio + video stuck) ---
        if (now - lastTimeStamp > 5000) {
          lastTimeStamp = now;
          const buffered = video.buffered;
          for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i);
            const end = buffered.end(i);
            if (ct >= start && ct < end) {
              const ahead = end - ct;
              if (ahead > 0.5) {
                video.currentTime = ct + 0.1;
              }
              break;
            }
            if (start > ct + 0.5) {
              video.currentTime = start;
              break;
            }
          }

          stallRecoveries++;
          if (stallRecoveries === 1) {
            // Gentle: tell hls.js to resume loading
            const hls = hlsRef.current;
            if (hls) {
              try { hls.startLoad(); } catch {}
            }
          } else if (stallRecoveries === 2) {
            // Medium: try recovering media error
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
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 10,
        stretchShortVideoTrack: false,
        startLevel: -1,
        capLevelToPlayerSize: false,
        maxBufferHole: 0.3,
        nudgeMaxRetry: 5,
        nudgeOffset: 0.2,
        maxStarvationDelay: 3,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 15000,
        manifestLoadingTimeOut: 10000,
        startFragPrefetch: true,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        const parsedLevels = hls.levels ? [...hls.levels] : [];
        const defaultIdx = find720LevelIndex(parsedLevels);
        setLevels(parsedLevels);
        if (defaultIdx >= 0) {
          setSelectedQuality(defaultIdx);
          hls.currentLevel = defaultIdx;
        } else {
          setSelectedQuality(-1);
        }
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
    if (index === -1) {
      const defaultIdx = find720LevelIndex(hls.levels);
      if (defaultIdx >= 0) index = defaultIdx;
    }
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
