"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dices, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function pickFrom(items: any[]): string | null {
  if (!items || items.length === 0) return null;
  const item = items[Math.floor(Math.random() * items.length)];
  if (!item) return null;
  const id = item.id ?? item.mal_id ?? item.idMal;
  return id ? `/anime/${id}?source=${item.source || "mal"}` : null;
}

export function RandomAnimeButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let href: string | null = null;
      const page = 1 + Math.floor(Math.random() * 80);
      try {
        const res = await api.topRated(page);
        href = pickFrom(res?.data);
      } catch { /* try next */ }
      if (!href) {
        const res = await api.trending(1 + Math.floor(Math.random() * 5));
        href = pickFrom(res?.data);
      }
      if (!href) {
        const res = await api.search("anime", { order_by: "popularity" });
        href = pickFrom(res?.data);
      }
      if (href) router.push(href);
    } catch {
      /* ignore — keep button usable */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      title="Surprise me with a random anime"
      aria-label="Random anime"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-2 text-mist transition-colors hover:border-primary-400/40 hover:text-primary-300",
        className
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}
      <span className="hidden sm:inline text-xs font-medium">Random</span>
    </button>
  );
}
