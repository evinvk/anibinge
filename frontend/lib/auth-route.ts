import { NextRequest, NextResponse } from "next/server";

export function decodeToken(token: string): Record<string, any> {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
  } catch {
    return {};
  }
}

export function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return decodeToken(auth.slice(7)).sub || null;
}

export function getUserName(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return decodeToken(auth.slice(7)).username || null;
}

export function requireUser(req: NextRequest): { userId: string; username: string } | NextResponse {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const username = getUserName(req) || "User-" + userId.slice(0, 6);
  return { userId, username };
}
