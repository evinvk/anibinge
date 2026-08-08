import { NextResponse } from "next/server";

const INDEXNOW_KEY = "5734b58eddfb02e577f1631c0700dcfa";

export function GET() {
  return new NextResponse(INDEXNOW_KEY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
