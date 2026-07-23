"use client";

import dynamic from "next/dynamic";

const StreamingPlayer = dynamic(
  () => import("@/components/streaming-player").then((m) => m.StreamingPlayer),
  { ssr: false, loading: () => <div className="aspect-video w-full animate-pulse rounded-xl2 bg-surface-hi" /> }
);

export function LazyStreamingPlayer({ animeTitle, anilistId }: { animeTitle: string; anilistId: number }) {
  return <StreamingPlayer animeTitle={animeTitle} anilistId={anilistId} />;
}
