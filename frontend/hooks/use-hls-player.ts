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

  // Attach video element event listeners — run only when videoRef.current changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Simple stall recovery: if video is playing but currentTime hasn't moved
    // for >4s and there IS buffered data ahead, nudge the playhead forward.
    // This replaces the heavy rAF loop that caused audio/video desync by
    // seeking too aggressively.
    let lastTime = video.currentTime;
    let lastTimeStamp = Date.now();
    let stallCheckId: ReturnType<typeof setInterval> | null = null;
    let frameCallbackId: number | null = null;
    let lastVideoFrameStamp = Date.now();
    let videoFreezeRecoveries = 0;

    // currentTime can keep advancing with audio even when the video decoder is
    // stuck. requestVideoFrameCallback detects that without repeated seeking.
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

          // Audio-only progress while no frame renders is a decoder freeze.
          // Recover once in place, then switch provider if it remains stuck.
          if (
            typeof video.requestVideoFrameCallback === "function" &&
            video.videoWidth > 0 &&
            document.visibilityState === "visible" &&
            Date.now() - lastVideoFrameStamp > 6000
          ) {
            lastVideoFrameStamp = Date.now();
            videoFreezeRecoveries++;
            const hls = hlsRef.current;
            if (videoFreezeRecoveries === 1 && hls) {
              try { hls.recoverMediaError(); } catch {}
            } else if (videoFreezeRecoveries >= 2) {
              videoFreezeRecoveries = 0;
              onFatalErrorRef.current?.("videoFreeze");
            }
          }
          return;
        }
        // currentTime frozen for >4s while playing
        if (Date.now() - lastTimeStamp > 4000) {
          lastTimeStamp = Date.now();
          const buffered = video.buffered;
          // Look for buffered range ahead of current position
          for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i);
            const end = buffered.end(i);
            if (video.currentTime >= start && video.currentTime < end) {
              const ahead = end - video.currentTime;
              if (ahead > 0.5) {
                // Tiny nudge to un-stick the decoder
                video.currentTime = video.currentTime + 0.1;
              }
              return;
            }
            // Gap between ranges — jump to start of next buffered block
            if (start > video.currentTime + 0.5) {
              video.currentTime = start;
              return;
            }
          }
          // No buffered data at all — HLS.js should be fetching; let it work
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
      // After 3s of stall, try to resume load in HLS.js
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
      // Native video element error (non-HLS path)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Larger buffer = fewer stalls and less chance of audio running ahead
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        // Keep 10s back-buffer so backward seeks don't re-fetch
        backBufferLength: 10,
        // Start at highest reasonable level (ABR will drop down if needed)
        startLevel: -1,
        capLevelToPlayerSize: false,
        // Small hole: only auto-skip tiny gaps, not 1-second chunks
        maxBufferHole: 0.3,
        // Keep audio/video in sync; don't stretch short tracks
        stretchShortVideoTrack: false,
        // Nudge factor for A/V sync correction
        nudgeMaxRetry: 5,
        nudgeOffset: 0.1,
        // Retry network errors aggressively before giving up
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        // Slightly longer timeout to avoid false 404s on slow proxy
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
                  console.warn("[HLS] Network error (%d/3), retrying...", networkErrorRetryRef.current, data.details);
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
                  console.warn("[HLS] Network error (%d/4), retrying:", networkErrorRetryRef.current, data.details);
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
                console.warn("[HLS] Media error, recovering (%d/4):", mediaErrorRetryRef.current, data.details);
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
          // Non-fatal: 410 on a segment = CDN deleted it, try to skip ahead
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

      onLoadSubtitlesRef.current();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => setPlayerStatus("error"));
      }, { once: true });
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
