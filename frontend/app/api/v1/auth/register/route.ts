import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth-store";

export async function POST(req: NextRequest) {
  try {
    const { email, username, password } = await req.json();
    if (!email || !username || !password) {
      return NextResponse.json({ detail: "Email, username, and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ detail: "Password must be at least 8 characters" }, { status: 400 });
    }
    const result = await registerUser(email, username, password);
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ detail: e.message || "Registration failed" }, { status });
  }
}
