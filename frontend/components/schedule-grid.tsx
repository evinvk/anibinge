"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function ScheduleGrid({ data }: { data: Record<string, any> }) {
  const todayName = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
    []
  );

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {DAYS.map((day) => (
        <div key={day} className={`glass-card p-4 ${day === todayName ? "border-primary-400/50 shadow-glow-sm" : ""}`}>
          <h3 className="mb-3 font-display text-sm font-semibold capitalize">
            {day} {day === todayName && <span className="text-primary-400">· Today</span>}
          </h3>
          <div className="space-y-3">
            {(data?.[day]?.data ?? []).slice(0, 6).map((item: any) => (
              <Link key={item.id} href={`/anime/${item.id}`} className="flex items-center gap-3">
                <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded">
                  {item.image && (
                    <Image src={item.image} alt={item.title} fill className="object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{item.title}</p>
                  <p className="font-mono text-[10px] text-mist">
                    {new Date(item.broadcast?.time ? `1970-01-01T${item.broadcast.time}:00` : Date.now()).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </Link>
            ))}
            {(!data?.[day]?.data || data[day].data.length === 0) && (
              <p className="text-xs text-mist">Nothing scheduled.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
