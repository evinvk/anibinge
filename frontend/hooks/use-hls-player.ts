"use client";

import { useState, useRef, useCallback } from "react";

interface StreamSource {
  quality: string;
  url: string;
}

interface StreamData {
  qualities: StreamSource[];
}

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
  const hlsRef = useRef<any>(null);
  const sourceRef = useRef<"gogoanime" | "anivexa" | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const refererRef = useRef("");
  const onFatalErrorRef = useRef(onFatalError);
  const onLoadSubtitlesRef = useRef(onLoadSubtitles);
  const loadGenRef = useRef(0);
  onFatalErrorRef.current = onFatalError;
  onLoadSubtitlesRef.current = onLoadSubtitles;

  const loadPlayer = useCallback(async (url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    const gen = ++loadGenRef.current;
    const Hls = (await import("hls.js")).default;
    if (gen !== loadGenRef.current) return;

    if (Hls.isSupported()) {
      const referer = refererRef.current;
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        ...(referer ? {
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader("Referer", referer);
          },
          fetchSetup: (context: any, init: RequestInit) => {
            return new Request(context.url, { ...init, headers: { ...init.headers, Referer: referer } });
          },
        } : {}),
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
      onLoadSubtitlesRef.current();
      hls.on(Hls.Events.ERROR, (_: any, data: any) => {
        if (data.fatal) {
          if (onFatalErrorRef.current) {
            onFatalErrorRef.current(data.type);
          } else {
            setError("Playback error: " + data.type);
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      onLoadSubtitlesRef.current();
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported in this browser");
    }
  }, [videoRef]);

  function setQuality(index: number) {
    setSelectedQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  }

  function setReferer(r: string) {
    refererRef.current = r;
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
    hlsRef,
    sourceRef,
    fallbackAttemptedRef,
    loadPlayer,
    setReferer,
    setQuality,
    resetPlayer,
    destroyHls,
  };
}
