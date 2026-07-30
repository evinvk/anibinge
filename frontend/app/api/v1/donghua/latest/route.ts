import { NextResponse } from "next/server";
import { fetchHtml, parseCardsAuto } from "../_animexin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const path = page > 1 ? `/page/${page}/` : "/";
    const html = await fetchHtml(path);
    const items = parseCardsAuto(html);
    return NextResponse.json({ data: items, page });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
