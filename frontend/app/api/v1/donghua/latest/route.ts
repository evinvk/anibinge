import { NextResponse } from "next/server";
import { fetchHtml, parseCardsAuto, fetchLatestWp } from "../_animexin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dedupeBySlug(items: any[]): any[] {
  const seen = new Map<string, any>();
  for (const item of items) {
    const existing = seen.get(item.slug);
    if (!existing || (item.episode ?? 0) > (existing.episode ?? 0)) {
      seen.set(item.slug, item);
    }
  }
  return Array.from(seen.values());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  try {
    const wpItems = await fetchLatestWp(page);
    if (wpItems) {
      return NextResponse.json({ data: dedupeBySlug(wpItems), page });
    }
    const path = page > 1 ? `/page/${page}/` : "/";
    const html = await fetchHtml(path);
    const items = parseCardsAuto(html);
    return NextResponse.json({ data: dedupeBySlug(items), page });
  } catch (e: any) {
    try {
      const path = page > 1 ? `/page/${page}/` : "/";
      const html = await fetchHtml(path);
      const items = parseCardsAuto(html);
      return NextResponse.json({ data: dedupeBySlug(items), page });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 503 });
    }
  }
}
