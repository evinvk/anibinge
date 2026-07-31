import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/auth-store";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const adminId = getCurrentAdminUser(req);
    if (!adminId) {
      return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    }

    const { deleteUser } = await import("@/lib/auth-store");
    const result = await deleteUser(id, adminId);
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ detail: e.message || "Failed to delete user" }, { status });
  }
}
