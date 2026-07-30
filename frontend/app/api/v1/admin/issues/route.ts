import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  const adminId = getCurrentAdminUser(req);
  if (!adminId) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  // Issues are backend-only — return empty
  return NextResponse.json({ issues: [], total: 0 });
}
