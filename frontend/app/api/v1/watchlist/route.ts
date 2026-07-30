import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getWatchlist, upsertWatchlistEntry } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const entries = getWatchlist(user.id);
  return NextResponse.json({ user_id: user.id, entries });
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  try {
    const body = await req.json();
    const { anime_id, source, status, progress, rating } = body;
    if (!anime_id || !status) {
      return NextResponse.json({ detail: "anime_id and status are required" }, { status: 400 });
    }

    const entry = upsertWatchlistEntry(user.id, {
      anime_id,
      source: source || "mal",
      status,
      progress,
      rating,
    });

    return NextResponse.json({ user_id: user.id, entry });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message || "Failed to update watchlist" }, { status: 500 });
  }
}
