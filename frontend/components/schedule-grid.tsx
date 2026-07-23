"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn, hasValidImageUrl } from "@/lib/utils";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function ScheduleGrid({ data }: { data: Record<string, any> }) {
  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
    []
  );
  const [openDay, setOpenDay] = useState<string>(todayName);

  const toggle = (day: string) => setOpenDay((prev) => (prev === day ? "" : day));

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {DAYS.map((day) => {
          const items = data?.[day]?.data ?? [];
          const isOpen = openDay === day;
          const isToday = day === todayName;

          return (
            <button
              key={day}
              onClick={() => toggle(day)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-5 text-left transition-all",
                isToday
                  ? "border-primary-400/30 bg-primary-600/10"
                  : "border-white/5 bg-surface-hi/50",
                isOpen && "border-primary-400/50 bg-primary-600/15 shadow-glow-sm"
              )}
            >
              <span className="flex flex-col gap-1">
                <span className="font-display text-base font-semibold capitalize">{day}</span>
                {isToday && (
                  <span className="text-[11px] font-medium text-primary-400">Today</span>
                )}
                <span className="text-xs text-mist">
                  {items.length > 0 ? `${items.length} anime` : "Nothing"}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-mist transition-transform duration-200",
                  isOpen && "rotate-180 text-primary-400"
                )}
              />
            </button>
          );
        })}
      </div>

      {openDay && (
        <div className="mt-3 rounded-xl border border-white/10 bg-surface-hi/30 p-4">
          <h3 className="mb-3 font-display text-sm font-semibold capitalize text-paper">
            {openDay}
            {openDay === todayName && (
              <span className="ml-2 text-primary-400">· Today</span>
            )}
          </h3>
          {(data?.[openDay]?.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-mist">Nothing scheduled.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.[openDay]?.data ?? []).map((item: any) => (
                <Link
                  key={item.id}
                  href={`/anime/${item.id}`}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                >
                  <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-surface-hi">
                    {hasValidImageUrl(item.image) ? (
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-sm font-bold text-mist/40">{item.title?.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.air_time && (
                      <p className="font-mono text-xs text-primary-400">
                        {(() => {
                          try {
                            const [h, m] = item.air_time.split(":");
                            const d = new Date();
                            d.setHours(parseInt(h), parseInt(m));
                            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          } catch {
                            return item.air_time;
                          }
                        })()}
                      </p>
                    )}
                    {item.genres && (
                      <p className="mt-0.5 truncate text-[11px] text-mist/70">
                        {Array.isArray(item.genres)
                          ? item.genres.slice(0, 3).join(" · ")
                          : item.genres.split(" ").slice(0, 3).join(" · ")}
                      </p>
                    )}
                  </div>
                  {item.score ? (
                    <span className="shrink-0 rounded-full bg-void/70 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-md">
                      ★ {item.score.toFixed(1)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
