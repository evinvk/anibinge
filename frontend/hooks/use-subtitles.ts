"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface Subtitle {
  file: string;
  label: string;
  language: string;
  kind: string;
  default: boolean;
  source: string;
  referer: string;
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

function parseVtt(vttText: string): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = [];
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
    cues.push({ start: parseVttTime(startStr), end: parseVttTime(endStr), text });
  }
  return cues;
}

export function useSubtitles(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const subtitlesRef = useRef<Subtitle[]>([]);
  const [activeCues, setActiveCues] = useState<string[]>([]);
  const cuesRef = useRef<{ start: number; end: number; text: string }[]>([]);
  const [selectedSub, setSelectedSub] = useState<number>(0);
  const parsedSubsRef = useRef<Map<number, { start: number; end: number; text: string }[]>>(new Map());

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const t = video.currentTime;
      const active = cuesRef.current
        .filter((c) => t >= c.start && t <= c.end)
        .map((c) => c.text);
      setActiveCues(active);
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, []);

  async function loadSubtitles() {
    const subs = subtitlesRef.current;
    if (!subs.length) return;
    parsedSubsRef.current.clear();

    for (let i = 0; i < subs.length; i++) {
      try {
        const resp = await fetch(subs[i].file);
        if (!resp.ok) continue;
        const vttText = await resp.text();
        const cues = parseVtt(vttText);
        if (cues.length > 0) {
          parsedSubsRef.current.set(i, cues);
        }
      } catch {
        // subtitle failed
      }
    }

    const defaultIdx = subs.findIndex((s) => s.default);
    const firstAvailable = Array.from(parsedSubsRef.current.keys())[0];
    const idx = defaultIdx >= 0 && parsedSubsRef.current.has(defaultIdx) ? defaultIdx : firstAvailable;
    if (idx !== undefined) {
      setSelectedSub(idx);
      cuesRef.current = parsedSubsRef.current.get(idx) || [];
    }
  }

  function switchSub(idx: number) {
    setSelectedSub(idx);
    cuesRef.current = parsedSubsRef.current.get(idx) || [];
    setActiveCues([]);
  }

  function setSubs(subs: Subtitle[]) {
    subtitlesRef.current = subs;
    setSubtitles(subs);
  }

  function resetSubs() {
    subtitlesRef.current = [];
    setSubtitles([]);
    cuesRef.current = [];
    setActiveCues([]);
    setSelectedSub(0);
    parsedSubsRef.current.clear();
  }

  return {
    subtitles,
    subtitlesRef,
    activeCues,
    selectedSub,
    setSelectedSub,
    cuesRef,
    parsedSubsRef,
    loadSubtitles,
    switchSub,
    setSubs,
    resetSubs,
    setActiveCues,
  };
}
