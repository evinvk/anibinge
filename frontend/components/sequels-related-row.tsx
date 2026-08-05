"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

const SHOWN_TYPES = ["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "SUMMARY", "ALTERNATIVE", "CHARACTER"];
const LABELS: Record<string, string> = {
  SEQUEL: "Sequel",
  PREQUEL: "Prequel",
  PARENT: "Main series",
  SIDE_STORY: "Side story",
  SPIN_OFF: "Spin-off",
  SUMMARY: "Summary",
  ALTERNATIVE: "Alternative version",
  CHARACTER: "Character show",
};

export function SequelsRelatedRow({ anilistId }: { anilistId: number | null }) {
  const [relations, setRelations] = useState<any[]>([]);

  useEffect(() => {
    if (!anilistId) return;
    let cancelled = false;
    fetch(`/api/v1/anime/${anilistId}?source=anilist`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const seen = new Set<number>();
        const list = (json?.data?.relations ?? [])
          .filter((rel: any) => SHOWN_TYPES.includes(rel.type) && !seen.has(rel.id) && seen.add(rel.id))
          .slice(0, 12);
        setRelations(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [anilistId]);

  if (relations.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold">Sequels & Related</h2>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {relations.map((r: any) => (
          <Link
            key={r.id}
            href={`/anime/${r.mal_id ?? r.id}?source=${r.mal_id ? "mal" : "anilist"}`}
            className="group w-28 shrink-0 sm:w-32"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-hi">
              {r.image && (
                <Image src={r.image} alt={r.title} fill sizes="128px" className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized />
              )}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-300 backdrop-blur-sm">
                {LABELS[r.type] ?? r.type}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-paper transition-colors group-hover:text-primary-400">
              {r.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
