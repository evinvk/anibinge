"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  title: string;
  anilistId?: number;
  totalEpisodes?: number | null;
}

export function DownloadButton({ title, anilistId, totalEpisodes }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const searchRes = await api.gogoanimeSearch(title).catch(() => null);
      const slug = searchRes?.data?.[0]?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const ep = totalEpisodes && totalEpisodes > 1 ? 1 : 1;
      const dlUrl = api.downloadUrl({
        slug,
        anilist_id: anilistId || undefined,
        ep,
        audio: "sub",
        filename: `${title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}_E${ep}`,
      });
      window.open(dlUrl, "_blank");
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
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Download EP 1
    </button>
  );
}
