import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";
import { listIssues } from "@/lib/comments-store";

export async function GET(req: NextRequest) {
  const adminId = getCurrentAdminUser(req);
  if (!adminId) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  const search = req.nextUrl.searchParams;
  const slug = search.get("slug") || undefined;
  const resolvedParam = search.get("resolved");
  const resolved = resolvedParam === "true" ? true : resolvedParam === "false" ? false : undefined;
  const limit = Math.min(Math.max(parseInt(search.get("limit") || "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(search.get("offset") || "0", 10) || 0, 0);

  const result = await listIssues({ slug, resolved, limit, offset });
  return NextResponse.json(result);
}
