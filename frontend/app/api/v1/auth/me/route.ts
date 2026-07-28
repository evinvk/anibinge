import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth-store";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const token = auth.slice(7);
  const user = getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ detail: "Invalid or expired token" }, { status: 401 });
  }
  return NextResponse.json(user);
}
