import { api } from "@/lib/api";
import { ScheduleGrid } from "@/components/schedule-grid";
export const dynamic = "force-dynamic";
export const metadata = { title: "Airing Schedule" };

export default async function SchedulePage() {
  const weekly = await api.weeklySchedule();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Weekly Schedule</h1>
      <p className="mt-1 text-mist">Air times shown in your local timezone.</p>
      <ScheduleGrid data={weekly} />
    </div>
  );
}
