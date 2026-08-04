import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty/opaque body is fine
    }

    const path = typeof body?.path === "string" && body.path.length > 0 ? body.path : "/";
    if (!path.startsWith("/") || path.length > 500) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const referrer = typeof body?.referrer === "string" && body.referrer ? body.referrer.slice(0, 800) : null;
    const visitorId =
      typeof body?.visitor_id === "string" && body.visitor_id ? body.visitor_id.slice(0, 64) : "anon";
    const userAgent = req.headers.get("user-agent")?.slice(0, 400) || null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    await query(
      "INSERT INTO page_views (visitor_id, path, referrer, user_agent, ip) VALUES ($1, $2, $3, $4, $5)",
      [visitorId, path, referrer, userAgent, ip]
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}