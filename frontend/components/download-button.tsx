"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  title: string;
  anilistId?: number;
  totalEpisodes?: number | null;
  slug?: string;
}

export function DownloadButton({ title, anilistId, totalEpisodes, slug }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      let resolvedSlug = slug;

      if (!resolvedSlug) {
        const searchRes = await api.gogoanimeSearch(title).catch(() => null);
        if (searchRes?.data?.[0]?.slug) {
          resolvedSlug = searchRes.data[0].slug;
        } else {
          resolvedSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        }
      }

      if (resolvedSlug) {
        const q = new URLSearchParams();
        if (anilistId) q.set("anilist_id", String(anilistId));
        const qs = q.toString();
        router.push(`/download/${resolvedSlug}${qs ? `?${qs}` : ""}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const epCount = totalEpisodes && totalEpisodes > 0 ? totalEpisodes : 1;

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-mist transition hover:border-primary-400/40 hover:bg-primary-600/10 hover:text-primary-400 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {epCount > 1 ? `Download All (${epCount} eps)` : "Download EP 1"}
    </button>
  );
}
