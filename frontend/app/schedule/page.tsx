import { api } from "@/lib/api";
import { ScheduleGrid } from "@/components/schedule-grid";

export const metadata = { title: "Airing Schedule" };

export default async function SchedulePage() {
  let weekly = {};
  try {
    weekly = await api.weeklySchedule();
  } catch (err) {
    console.error("Weekly schedule fetch failed:", err);
    // fall through with an empty schedule rather than crashing the page
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Weekly Schedule</h1>
      <p className="mt-1 text-mist">Air times shown in your local timezone.</p>
      <ScheduleGrid data={weekly} />
    </div>
  );
}
