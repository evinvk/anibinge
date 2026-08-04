import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser, getUserCount } from "@/lib/auth-store";
import { query } from "@/lib/db";

interface CountRow {
  c: number;
}

export async function GET(req: NextRequest) {
  const adminId = getCurrentAdminUser(req);
  if (!adminId) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  const [visitorsToday, pageviewsToday, visitors7d, pageviews7d, visitors30d, pageviews30d, active24h, views24h, watchlist] =
    await Promise.all([
      query<CountRow>(
        "SELECT count(DISTINCT visitor_id)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now())"
      ),
      query<CountRow>("SELECT count(*)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now())"),
      query<CountRow>(
        "SELECT count(DISTINCT visitor_id)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now()) - interval '6 days'"
      ),
      query<CountRow>(
        "SELECT count(*)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now()) - interval '6 days'"
      ),
      query<CountRow>(
        "SELECT count(DISTINCT visitor_id)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now()) - interval '29 days'"
      ),
      query<CountRow>(
        "SELECT count(*)::int AS c FROM page_views WHERE created_at >= date_trunc('day', now()) - interval '29 days'"
      ),
      query<CountRow>(
        "SELECT count(DISTINCT visitor_id)::int AS c FROM page_views WHERE created_at >= now() - interval '24 hours'"
      ),
      query<CountRow>("SELECT count(*)::int AS c FROM page_views WHERE created_at >= now() - interval '24 hours'"),
      query<CountRow>("SELECT count(*)::int AS c FROM watchlist"),
    ]);

  return NextResponse.json({
    visitors_today: visitorsToday[0]?.c ?? 0,
    pageviews_today: pageviewsToday[0]?.c ?? 0,
    visitors_7d: visitors7d[0]?.c ?? 0,
    pageviews_7d: pageviews7d[0]?.c ?? 0,
    visitors_30d: visitors30d[0]?.c ?? 0,
    pageviews_30d: pageviews30d[0]?.c ?? 0,
    daily_active_users: active24h[0]?.c ?? 0,
    requests_last_24h: views24h[0]?.c ?? 0,
    total_users: await getUserCount(),
    total_watchlist_entries: watchlist[0]?.c ?? 0,
    top_searches_today: [],
  });
}