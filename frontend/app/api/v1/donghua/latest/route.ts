import { NextResponse } from "next/server";
import { fetchHtml, parseCardsFromMarkdown, fetchLatestWp } from "../_animexin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const wpItems = await fetchLatestWp(page);
    if (wpItems) {
      return NextResponse.json({ data: wpItems, page });
    }
    const path = page > 1 ? `/page/${page}/` : "/";
    const html = await fetchHtml(path);
    const items = parseCardsFromMarkdown(html);
    return NextResponse.json({ data: items, page });
  } catch (e: any) {
    try {
      const path = page > 1 ? `/page/${page}/` : "/";
      const html = await fetchHtml(path);
      const items = parseCardsFromMarkdown(html);
      return NextResponse.json({ data: items, page });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 503 });
    }
  }
}
