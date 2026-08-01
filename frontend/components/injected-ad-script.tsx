"use client";

import { useEffect } from "react";

interface InjectedAdScriptProps {
  id: string;
  src: string;
}

export function InjectedAdScript({ id, src }: InjectedAdScriptProps) {
  useEffect(() => {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    document.body.appendChild(script);
  }, [id, src]);

  return null;
}
