"use client";

import { useEffect, useRef } from "react";

export function MonetagPopunder() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    const target = document.body;
    const script = document.createElement("script");
    script.dataset.zone = "11404928";
    script.src = "https://al5sm.com/tag.min.js";
    target.appendChild(script);
  }, []);

  return null;
}
