import { NextResponse } from "next/server";
import { fetchHtml, parseSearch } from "../_animexin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q) return NextResponse.json({ error: "Missing query param q" }, { status: 400 });
  try {
    const html = await fetchHtml("/", { s: q });
    const items = parseSearch(html);
    return NextResponse.json({ data: items, query: q });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
