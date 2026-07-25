"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  title: string;
  anilistId?: number;
  totalEpisodes?: number | null;
  slug?: string;
}

export function DownloadButton({ title, anilistId, totalEpisodes, slug }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    try {
      let resolvedSlug = slug;
      let resolvedAnilistId = anilistId;

      const searchRes = await api.gogoanimeSearch(title).catch(() => null);
      if (searchRes?.data?.[0]?.slug) {
        resolvedSlug = searchRes.data[0].slug;
      } else if (!resolvedSlug) {
        resolvedSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }

      if (!resolvedAnilistId) {
        const resolveRes = await api.anivexaResolve(title).catch(() => null);
        if (resolveRes?.anilist_id) {
          resolvedAnilistId = resolveRes.anilist_id;
        }
      }

      const epCount = totalEpisodes && totalEpisodes > 0 ? totalEpisodes : 1;
      const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();

      if (epCount === 1) {
        const dlUrl = api.downloadUrl({
          slug: resolvedSlug,
          anilist_id: resolvedAnilistId || undefined,
          ep: 1,
          audio: "sub",
          filename: `${cleanTitle}_E1`,
        });
        window.open(dlUrl, "_blank");
      } else {
        setProgress({ current: 1, total: epCount });
        for (let ep = 1; ep <= epCount; ep++) {
          setProgress({ current: ep, total: epCount });
          const dlUrl = api.downloadUrl({
            slug: resolvedSlug,
            anilist_id: resolvedAnilistId || undefined,
            ep,
            audio: "sub",
            filename: `${cleanTitle}_E${ep}`,
          });
          window.open(dlUrl, "_blank");
          if (ep < epCount) {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
      }
    } catch {
      const dlUrl = api.downloadUrl({
        anilist_id: anilistId || undefined,
        ep: 1,
        audio: "sub",
        filename: `${title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}_E1`,
      });
      window.open(dlUrl, "_blank");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const epCount = totalEpisodes && totalEpisodes > 0 ? totalEpisodes : 1;

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {progress ? `Downloading ${progress.current}/${progress.total}` : epCount > 1 ? `Download Season (${epCount} eps)` : "Download EP 1"}
    </button>
  );
}
