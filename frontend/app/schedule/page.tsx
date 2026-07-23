"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { needsUnoptimized } from "@/lib/utils";
import { ScheduleGrid } from "@/components/schedule-grid";
import type { AnimeSummary } from "@/lib/api";

export default function SchedulePage() {
  const [weekly, setWeekly] = useState<Record<string, any>>({});
  const [upcoming, setUpcoming] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.weeklySchedule().catch(() => ({})),
      api.upcoming().catch(() => ({ data: [] })),
    ])
      .then(([sched, up]) => {
        setWeekly(sched);
        setUpcoming(up.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Weekly Schedule</h1>
      <p className="mt-1 text-mist">Air times shown in your local timezone.</p>
      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <ScheduleGrid data={weekly} />
      )}

      {upcoming.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold">Coming Soon</h2>
          <p className="mt-1 text-sm text-mist">Anime releasing in the near future.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {upcoming.slice(0, 18).map((anime) => (
              <Link
                key={anime.id}
                href={anime.source === "anilist" ? `/anime/${anime.id}?source=anilist` : `/anime/${anime.id}`}
                className="group"
              >
                <div className="glass-card overflow-hidden">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-xl2">
                    {anime.image ? (
                      <Image
                        src={anime.image}
                        alt={anime.title_english || anime.title}
                        fill
                        loading="lazy"
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        unoptimized={needsUnoptimized(anime.image)}
                      />
                    ) : (
                      <div className="h-full w-full bg-surface-hi" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
                      {anime.title_english || anime.title}
                    </h3>
                    <p className="mt-1 truncate text-xs text-mist">
                      {anime.start_date
                        ? new Date(anime.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                        : "TBA"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
