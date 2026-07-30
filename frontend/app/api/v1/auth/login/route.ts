import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth-store";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ detail: "Email and password are required" }, { status: 400 });
    }
    const result = loginUser(email, password);
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ detail: e.message || "Login failed" }, { status });
  }
}
