import { NextResponse } from "next/server";

const INDEXNOW_KEY = "ba82636ed4b641558b53cbef2a9efdd7";

export function GET() {
  return new NextResponse(INDEXNOW_KEY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
