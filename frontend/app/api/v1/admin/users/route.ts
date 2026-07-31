import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  try {
    const adminId = getCurrentAdminUser(req);
    if (!adminId) {
      return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = 50;

    const { listUsers } = await import("@/lib/auth-store");
    const result = await listUsers(q, page, perPage);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ detail: e.message || "Failed to list users" }, { status: 500 });
  }
}
