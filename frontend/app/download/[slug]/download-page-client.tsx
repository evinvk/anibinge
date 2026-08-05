"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, ArrowDownToLine } from "lucide-react";
import { api } from "@/lib/api";
import { VideoAdOverlay } from "@/components/video-ad-overlay";
import { MonetagPopunder } from "@/components/monetag-popunder";

interface DownloadPageClientProps {
  slug: string;
  title: string;
  totalEps: number | null;
  anilistId: number | null;
  initialEp: number;
}

const AD_SRC = "https://omg10.com/4/11482825";

function downloadUrl(slug: string, anilistId: number | null, ep: number, audio: "sub" | "dub", title: string): string {
  const clean = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return api.downloadUrl({
    slug,
    anilist_id: anilistId || undefined,
    ep,
    audio,
    filename: `${clean}_E${ep}${audio === "dub" ? "_DUB" : ""}`,
  });
}

function startDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function DownloadPageClient({
  slug,
  title,
  totalEps,
  anilistId,
  initialEp,
}: DownloadPageClientProps) {
  const [downloading, setDownloading] = useState<{ ep: number; audio: "sub" | "dub" } | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const handleDownload = useCallback(
    (ep: number, audio: "sub" | "dub") => {
      setDownloading({ ep, audio });
      setTimeout(() => {
        startDownload(downloadUrl(slug, anilistId, ep, audio, title));
        setDownloading(null);
      }, 50);
    },
    [slug, anilistId, title]
  );

  const handleDownloadAll = useCallback(async () => {
    const eps = totalEps && totalEps > 0 ? Math.min(totalEps, 100) : 0;
    if (!eps) return;
    setDownloadingAll(true);
    for (let ep = 1; ep <= eps; ep++) {
      startDownload(downloadUrl(slug, anilistId, ep, "sub", title));
      if (ep < eps) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    setDownloadingAll(false);
  }, [slug, anilistId, title, totalEps]);

  const eps = totalEps && totalEps > 0 ? Math.min(totalEps, 100) : 0;

  return (
    <div className="relative min-h-screen bg-void">
      <MonetagPopunder />
      <VideoAdOverlay
        key="download-page-ad"
        id="monetag-download-ad"
        src={AD_SRC}
        show={true}
        skipAfterMs={5000}
      />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-600/15 px-3 py-1 text-xs font-medium text-primary-400">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              MP4 Download
            </div>
            <h1 className="font-display text-2xl font-bold text-paper sm:text-3xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-mist">
              {initialEp > 0
                ? `Download episode ${initialEp} in MP4 format. Choose subtitled (Sub) or English dubbed (Dub).`
                : eps > 0
                  ? `${eps} episode${eps === 1 ? "" : "s"} available to download in MP4 format. Each file is remuxed to a real .mp4 and plays in any player.`
                  : "Download episodes in MP4 format. Each file is remuxed to a real .mp4 and plays in any player."}
            </p>
          </div>

          {initialEp === 0 && eps > 1 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:opacity-60"
            >
              {downloadingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening downloads…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download All Episodes
                </>
              )}
            </button>
          )}
        </div>

        {initialEp > 0 ? (
          <SingleEpisode
            slug={slug}
            title={title}
            ep={initialEp}
            totalEps={totalEps}
            downloading={downloading}
            onDownload={handleDownload}
          />
        ) : (
          <EpisodeList
            slug={slug}
            title={title}
            eps={eps}
            totalEps={totalEps}
            downloading={downloading}
            onDownload={handleDownload}
          />
        )}
      </div>
    </div>
  );
}

function SingleEpisode({
  slug,
  title,
  ep,
  totalEps,
  downloading,
  onDownload,
}: {
  slug: string;
  title: string;
  ep: number;
  totalEps: number | null;
  downloading: { ep: number; audio: "sub" | "dub" } | null;
  onDownload: (ep: number, audio: "sub" | "dub") => void;
}) {
  const busy = (a: "sub" | "dub") => downloading?.ep === ep && downloading.audio === a;

  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-white/10 bg-surface-hi/40 p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-paper">Episode {ep}</h2>
            <p className="mt-1 text-sm text-mist">Select an audio track to start the MP4 download.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onDownload(ep, "sub")}
              disabled={!!downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-5 py-2.5 text-sm font-semibold text-paper transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400 disabled:opacity-60"
            >
              {busy("sub") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Sub
            </button>
            <button
              onClick={() => onDownload(ep, "dub")}
              disabled={!!downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:opacity-60"
            >
              {busy("dub") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Dub
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ep > 1 && (
            <Link
              href={`/download/${slug}?ep=${ep - 1}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:text-paper"
            >
              <ArrowLeft className="h-4 w-4" />
              Episode {ep - 1}
            </Link>
          )}
          <Link
            href={`/download/${slug}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:text-paper"
          >
            All episodes
          </Link>
          {totalEps && ep < totalEps && (
            <Link
              href={`/download/${slug}?ep=${ep + 1}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist transition hover:border-primary-400/40 hover:text-paper"
            >
              Episode {ep + 1}
              <ArrowLeft className="h-4 w-4 rotate-180" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function EpisodeList({
  slug,
  title,
  eps,
  totalEps,
  downloading,
  onDownload,
}: {
  slug: string;
  title: string;
  eps: number;
  totalEps: number | null;
  downloading: { ep: number; audio: "sub" | "dub" } | null;
  onDownload: (ep: number, audio: "sub" | "dub") => void;
}) {
  if (!eps) {
    return (
      <div className="mt-8 rounded-2xl border border-white/10 bg-surface-hi/40 p-6 text-center">
        <p className="text-sm text-mist">Episode count not available yet. Try again later.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-paper">Episodes</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: eps }, (_, i) => i + 1).map((ep) => (
          <div
            key={ep}
            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-surface-hi/40 p-3 transition hover:border-primary-400/40"
          >
            <span className="text-sm font-semibold text-paper">Episode {ep}</span>
            <button
              onClick={() => onDownload(ep, "sub")}
              disabled={!!downloading}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-600/80 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:opacity-60"
            >
              {downloading?.ep === ep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              MP4
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-mist">
        Not all episodes shown? {title} may have more episodes than listed here. Download buttons are added as sources become available.
      </p>
    </div>
  );
}
