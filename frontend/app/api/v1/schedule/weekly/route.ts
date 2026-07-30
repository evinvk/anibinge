import { NextResponse } from "next/server";
import { fetchSchedule, normalize, getDay, DAYS } from "../_lib";

export async function GET() {
  try {
    const grouped: Record<string, any[]> = {};
    for (const d of DAYS) grouped[d] = [];

    for (let pg = 1; pg <= 3; pg++) {
      const data = await fetchSchedule(pg, 50);
      const media = data?.data?.Page?.media || [];
      for (const m of media) {
        if (!m.nextAiringEpisode?.airingAt) continue;
        const item = normalize(m);
        const dt = new Date(m.nextAiringEpisode.airingAt * 1000);
        const day = DAYS[dt.getUTCDay()];
        grouped[day].push(item);
      }
    }

    const result: Record<string, { data: any[] }> = {};
    for (const [day, items] of Object.entries(grouped)) {
      result[day] = { data: items };
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
