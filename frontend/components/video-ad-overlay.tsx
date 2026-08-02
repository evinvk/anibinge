"use client";

import { useEffect, useRef, useState } from "react";

interface VideoAdOverlayProps {
  id: string;
  src: string;
  show: boolean;
  skipAfterMs?: number;
}

export function VideoAdOverlay({ id, src, show, skipAfterMs = 5000 }: VideoAdOverlayProps) {
  const [skipIn, setSkipIn] = useState(Math.ceil(skipAfterMs / 1000));
  const [skipped, setSkipped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSkipped(false);
    setSkipIn(Math.ceil(skipAfterMs / 1000));
  }, [show, src, skipAfterMs]);

  useEffect(() => {
    if (!show || skipped) return;
    const timer = setInterval(() => {
      setSkipIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [show, skipped]);

  useEffect(() => {
    if (!show || skipped) return;
    if (containerRef.current && !document.getElementById(id)) {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      containerRef.current.appendChild(script);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [show, skipped, id, src]);

  useEffect(() => {
    if (show && !skipped && skipIn <= 0) {
      setSkipped(true);
    }
  }, [skipIn, show, skipped]);

  if (!show || skipped) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90">
      <div ref={containerRef} id={`${id}-slot`} className="flex w-full items-center justify-center" />
      <button
        onClick={() => setSkipped(true)}
        disabled={skipIn > 0}
        className="absolute top-2 right-2 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {skipIn > 0 ? `Skip in ${skipIn}s` : "Skip ad"}
      </button>
    </div>
  );
}
