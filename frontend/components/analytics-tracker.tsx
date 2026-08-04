"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TRACK_URL = "/api/v1/track/pageview";
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
  if (path.startsWith("/admin") || path.startsWith("/api/")) return;
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
    navigator.sendBeacon(TRACK_URL, blob);
  } catch {
    // silent fail
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    send(pathname + (window.location.search || ""));
  }, [pathname]);

  return null;
}