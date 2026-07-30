import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ data: [] });

  try {
    const data = await fetchGogoApi(`/api/search?keyword=${encodeURIComponent(q)}`);
    return NextResponse.json({ data: Array.isArray(data) ? data : data.data || [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
