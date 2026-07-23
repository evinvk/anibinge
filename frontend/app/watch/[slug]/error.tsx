"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Watch page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass-card max-w-md p-8">
        <h1 className="font-display text-2xl font-bold text-paper">
          Stream unavailable
        </h1>
        <p className="mt-2 text-sm text-mist">
          {error.digest
            ? `Error: ${error.digest}`
            : "This stream is temporarily unavailable. Try switching providers or episodes."}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/80"
          >
            Try Again
          </button>
          <Link
            href="/browse"
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-mist transition hover:bg-white/5"
          >
            Browse Anime
          </Link>
        </div>
      </div>
    </div>
  );
}
