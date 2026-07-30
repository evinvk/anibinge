import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const adminId = getCurrentAdminUser(req);
    if (!adminId) {
      return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    }

    const { is_admin } = await req.json();
    const { setAdmin } = await import("@/lib/auth-store");
    const result = setAdmin(id, is_admin, adminId);
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ detail: e.message || "Failed to update admin status" }, { status });
  }
}
