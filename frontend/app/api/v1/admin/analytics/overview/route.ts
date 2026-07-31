import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  const adminId = getCurrentAdminUser(req);
  if (!adminId) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  const { getUserCount } = await import("@/lib/auth-store");
  return NextResponse.json({
    daily_active_users: 0,
    total_users: await getUserCount(),
    total_watchlist_entries: 0,
    top_searches_today: [],
    requests_last_24h: 0,
  });
}
