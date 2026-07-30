import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, removeWatchlistEntry } from "@/lib/auth-store";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ anime_id: string }> },
) {
  const user = getCurrentUser(req);
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const { anime_id } = await params;
  const result = removeWatchlistEntry(user.id, parseInt(anime_id));
  return NextResponse.json(result);
}
