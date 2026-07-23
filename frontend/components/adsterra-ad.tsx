"use client";

import { useEffect, useRef } from "react";

export function AdsterraAd({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const script = document.createElement("script");
    script.async = true as any;
    script.setAttribute("data-cfasync", "false");
    script.src = "https://pl30495365.effectivecpmnetwork.com/4232d52db18160b7194cd911bcbe75d6/invoke.js";
    container.appendChild(script);

    return () => {
      if (container.contains(script)) {
        container.removeChild(script);
      }
    };
  }, []);

  return (
    <div ref={containerRef}>
      <div id="container-4232d52db18160b7194cd911bcbe75d6" className={className} />
    </div>
  );
}
