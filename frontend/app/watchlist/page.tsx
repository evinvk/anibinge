"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = ["watching", "planning", "completed", "dropped", "favorites"] as const;

export default function WatchlistPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("watching");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">My Watchlist</h1>
      <p className="mt-1 text-mist">Sign in to sync your list across devices.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface-hi p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm capitalize transition-colors",
              tab === t ? "bg-primary-600 text-white" : "text-mist hover:text-paper"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TODO: fetch from GET /api/v1/watchlist?status={tab} once auth is wired up
          on the client (JWT stored via httpOnly cookie + a /me endpoint). */}
      <div className="mt-16 text-center text-mist">
        Your {tab} list is empty. Browse anime and tap "Add to Watchlist" to get started.
      </div>
    </div>
  );
}
