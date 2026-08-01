import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { SITE_URL, STUDIO_PAGES } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Anime Studios — Browse by Studio",
  description:
    "Browse anime by studio. Explore the full catalogs of MAPPA, Ufotable, Bones, Kyoto Animation, and every major animation studio — all streaming free on Anibinge.",
  alternates: { canonical: `${SITE_URL}/studios` },
};

export default function StudiosPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mt-6 flex items-center gap-2">
        <Clapperboard className="h-5 w-5 text-primary-400" />
        <h1 className="font-display text-3xl font-bold">Anime Studios</h1>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
        Explore anime by the studios that made them. From long-running industry giants like
        Toei Animation and Sunrise to modern powerhouses like MAPPA and Ufotable, every studio
        catalog below is free to stream.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {STUDIO_PAGES.map((s) => (
          <Link
            key={s.slug}
            href={`/studios/${s.slug}`}
            className="glass-card group p-4 transition hover:border-primary-400/40"
          >
            <h2 className="font-display text-base font-bold text-paper group-hover:text-primary-400">
              {s.name}
            </h2>
            <p className="mt-2 line-clamp-3 text-xs text-mist">{s.intro}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
