import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = parseInt(segments[segments.length - 2]);

  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const resp = await fetch(`https://api.jikan.moe/v4/anime/${id}/characters`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) return NextResponse.json({ data: [] });
    const data = await resp.json();
    return NextResponse.json({ data: data.data || [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
