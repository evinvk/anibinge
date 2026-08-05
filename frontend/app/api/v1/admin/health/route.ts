import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";
import { query } from "@/lib/db";

interface RunRow {
  id: number;
  started_at: string;
  duration_ms: number | null;
  total: number;
  passed: number;
  failed: number;
}

interface CheckRow {
  key: string;
  name: string;
  url: string | null;
  ok: boolean;
  error: string | null;
  latency_ms: number | null;
  checked_at: string;
}

export async function GET(req: NextRequest) {
  if (!getCurrentAdminUser(req)) {
    return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
  }

  const [runs, latestChecks] = await Promise.all([
    query<RunRow>(
      "SELECT id, started_at, duration_ms, total, passed, failed FROM health_runs ORDER BY id DESC LIMIT 10"
    ),
    query<CheckRow>(
      `SELECT key, name, url, ok, error, latency_ms, checked_at FROM health_checks
       WHERE run_id = (SELECT COALESCE(MAX(id), 0) FROM health_runs)
       ORDER BY id`
    ),
  ]);

  return NextResponse.json({
    latest_run: runs[0] ?? null,
    checks: latestChecks,
    recent_runs: runs,
  });
}