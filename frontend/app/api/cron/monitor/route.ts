import { NextRequest, NextResponse } from "next/server";
import { runHealthCheck } from "@/lib/monitor";
import { getCurrentAdminUser } from "@/lib/auth-store";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const isCron =
    req.headers.get("x-vercel-cron") === "1" || (req.headers.get("user-agent") || "").includes("vercel-cron");
  const isAdmin = !!getCurrentAdminUser(req);

  if (!isCron && !isAdmin) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const result = await runHealthCheck();
  return NextResponse.json(result);
}