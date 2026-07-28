import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const GOGO_API = "https://gogoanimehd.to";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  try {
    const resp = await fetch(
      `${GOGO_API}/api/search?keyword=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": UA, Referer: `${GOGO_API}/` }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    return NextResponse.json({ data: Array.isArray(data) ? data : data.data || [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
