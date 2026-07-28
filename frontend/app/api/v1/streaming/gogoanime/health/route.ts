import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET() {
  try {
    const resp = await fetch("https://gogoanimehd.to/api/home", {
      headers: { "User-Agent": UA, Referer: "https://gogoanimehd.to/" },
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ healthy: resp.ok, reason: resp.ok ? null : `HTTP ${resp.status}` });
  } catch (e: any) {
    return NextResponse.json({ healthy: false, reason: e.message });
  }
}
