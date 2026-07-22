"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function ScheduleGrid({ data }: { data: Record<string, any> }) {
  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
    []
  );
  const [openDay, setOpenDay] = useState<string>(todayName);

  const toggle = (day: string) => setOpenDay((prev) => (prev === day ? "" : day));

  return (
    <div className="mt-6 space-y-2">
      {DAYS.map((day) => {
        const items = data?.[day]?.data ?? [];
        const isOpen = openDay === day;
        const isToday = day === todayName;

        return (
          <div
            key={day}
            className={cn(
              "rounded-xl border transition-colors",
              isToday
                ? "border-primary-400/30 bg-primary-600/5"
                : "border-white/5 bg-surface-hi/50",
              isOpen && "border-white/10"
            )}
          >
            <button
              onClick={() => toggle(day)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold capitalize">{day}</span>
                {isToday && (
                  <span className="rounded-full bg-primary-600/20 px-2 py-0.5 text-[10px] font-medium text-primary-400">
                    Today
                  </span>
                )}
                {items.length > 0 && (
                  <span className="text-xs text-mist">{items.length} anime</span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-mist transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {isOpen && (
              <div className="border-t border-white/5 px-4 pb-3 pt-2">
                {items.length === 0 ? (
                  <p className="py-3 text-center text-xs text-mist">Nothing scheduled.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item: any) => (
                      <Link
                        key={item.id}
                        href={`/anime/${item.id}`}
                        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5"
                      >
                        <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded">
                          {item.image && (
                            <Image
                              src={item.image}
                              alt={item.title}
                              fill
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{item.title}</p>
                          <p className="font-mono text-[10px] text-mist">
                            {item.broadcast?.time
                              ? new Date(
                                  `1970-01-01T${item.broadcast.time}:00`
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
