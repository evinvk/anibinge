import { NextResponse } from "next/server";
import { getBatchViews, incrementView } from "@/lib/views";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (!ids) return NextResponse.json({ views: {} });
  const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
  const views = getBatchViews(idList);
  return NextResponse.json({ views });
}

export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    if (id == null) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const count = incrementView(id);
    return NextResponse.json({ id: String(id), views: count });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
