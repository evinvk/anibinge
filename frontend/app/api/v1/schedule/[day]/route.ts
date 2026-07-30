import { NextResponse } from "next/server";
import { fetchSchedule, normalize, DAYS } from "../_lib";

export async function GET(req: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day: dayRaw } = await params;
  const day = dayRaw.toLowerCase();
  if (!DAYS.includes(day)) {
    return NextResponse.json({ error: `Invalid day. Must be: ${DAYS.join(", ")}` }, { status: 400 });
  }

  try {
    const items: any[] = [];
    for (let pg = 1; pg <= 3; pg++) {
      const data = await fetchSchedule(pg, 50);
      const media = data?.data?.Page?.media || [];
      for (const m of media) {
        if (!m.nextAiringEpisode?.airingAt) continue;
        const dt = new Date(m.nextAiringEpisode.airingAt * 1000);
        if (DAYS[dt.getUTCDay()] === day) {
          items.push(normalize(m));
        }
      }
    }

    return NextResponse.json({ data: items, day });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
