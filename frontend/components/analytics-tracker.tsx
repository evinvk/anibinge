"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const VISITOR_KEY = "anibinge_visitor_id";

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function send(path: string) {
  if (!API_BASE || path.startsWith("/admin")) return;
  try {
    const blob = new Blob(
      [
        JSON.stringify({
          path,
          referrer: document.referrer || "",
          visitor_id: getVisitorId(),
        }),
      ],
      { type: "application/json" }
    );
    navigator.sendBeacon(`${API_BASE}/api/v1/track/pageview`, blob);
  } catch {
    // silent fail
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const path = pathname + (window.location.search || "");
    send(path);
  }, [pathname]);

  return null;
}
