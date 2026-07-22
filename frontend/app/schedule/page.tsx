"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ScheduleGrid } from "@/components/schedule-grid";

export default function SchedulePage() {
  const [weekly, setWeekly] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .weeklySchedule()
      .then(setWeekly)
      .catch((err) => console.error("Schedule fetch failed:", err))
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
    </div>
  );
}
