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
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [loadingStream, setLoadingStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const hlsRef = useRef<any>(null);
  const sourceRef = useRef<"gogoanime" | "anivexa" | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const onFatalErrorRef = useRef(onFatalError);
  const onLoadSubtitlesRef = useRef(onLoadSubtitles);
  const loadGenRef = useRef(0);
  onFatalErrorRef.current = onFatalError;
  onLoadSubtitlesRef.current = onLoadSubtitles;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlayerStatus("playing");
    const onPause = () => {};
    const onWaiting = () => setPlayerStatus("buffering");
    const onPlaying = () => setPlayerStatus("playing");
    const onCanPlay = () => {
      if (playerStatus === "buffering" || playerStatus === "idle") setPlayerStatus("playing");
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
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

    const gen = ++loadGenRef.current;
    const Hls = (await import("hls.js")).default;
    if (gen !== loadGenRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1,
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        if (data.levels?.length > 1) {
          hls.currentLevel = -1;
        }
        video.play().catch(() => {
          setPlayerStatus("error");
        });
      });

      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        setPlayerStatus("playing");
      });

      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          setPlayerStatus("error");
          if (onFatalErrorRef.current) {
            onFatalErrorRef.current(data.type);
          } else {
            setError("Playback error: " + data.type);
          }
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setPlayerStatus("buffering");
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
    setSelectedQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }

  function destroyHls() {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  function resetPlayer() {
    destroyHls();
    setStreamData(null);
    setMasterUrl(null);
    setSelectedQuality(0);
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
