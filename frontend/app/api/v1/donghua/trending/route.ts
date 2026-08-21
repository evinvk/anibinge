import { NextResponse } from "next/server";
import { parseHomepageFromMarkdown, parseCardsFromMarkdown, fetchHtml, fetchLatestWp } from "../_animexin";

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

export async function GET() {
  try {
    const html = await fetchHtml("/");
    const { popular, latest } = parseHomepageFromMarkdown(html);
    const items = popular.length > 0 ? popular : latest;
    if (items.length > 0) {
      return NextResponse.json({ data: dedupeBySlug(items).slice(0, 30) });
    }
    const cards = parseCardsFromMarkdown(html);
    if (cards.length > 0) {
      return NextResponse.json({ data: dedupeBySlug(cards).slice(0, 30) });
    }
  } catch {}
  try {
    const wpItems = await fetchLatestWp(1);
    if (wpItems && wpItems.length) {
      return NextResponse.json({ data: dedupeBySlug(wpItems).slice(0, 30) });
    }
  } catch {}
  return NextResponse.json({ data: [], error: "Trending unavailable" }, { status: 200 });
}
