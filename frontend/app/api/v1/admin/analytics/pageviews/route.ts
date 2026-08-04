import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";
import { query } from "@/lib/db";

interface TrendRow {
  day: string;
  pageviews: number;
  visitors: number;
}

interface TopRow {
  path?: string;
  referrer?: string;
  c: number;
}

export async function GET(req: NextRequest) {
  if (!getCurrentAdminUser(req)) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  const rawDays = parseInt(req.nextUrl.searchParams.get("days") || "14");
  const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? rawDays : 14));

  const [trendRows, topPages, topReferrers] = await Promise.all([
    query<TrendRow>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              count(*)::int AS pageviews,
              count(DISTINCT visitor_id)::int AS visitors
       FROM page_views
       WHERE created_at >= date_trunc('day', now()) - ($1::int || ' days')::interval
       GROUP BY date_trunc('day', created_at)
       ORDER BY 1`,
      [days]
    ),
    query<TopRow>(
      "SELECT path, count(*)::int AS c FROM page_views WHERE created_at >= now() - interval '30 days' GROUP BY path ORDER BY count(*) DESC LIMIT 8"
    ),
    query<TopRow>(
      `SELECT referrer, count(*)::int AS c FROM page_views
       WHERE created_at >= now() - interval '30 days' AND referrer IS NOT NULL AND referrer NOT ILIKE '%anibinge.fun%'
       GROUP BY referrer ORDER BY count(*) DESC LIMIT 6`
    ),
  ]);

  const byDay: Record<string, { pageviews: number; visitors: number }> = {};
  for (const r of trendRows) byDay[r.day] = { pageviews: r.pageviews, visitors: r.visitors };

  const trend: { date: string; pageviews: number; visitors: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay[key] || { pageviews: 0, visitors: 0 };
    trend.push({ date: key, ...entry });
  }

  return NextResponse.json({
    trend,
    top_pages: topPages.map((r) => ({ path: r.path ?? "", count: r.c })),
    top_referrers: topReferrers.map((r) => ({ referrer: r.referrer ?? "", count: r.c })),
  });
}