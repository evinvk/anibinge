import { NextResponse } from "next/server";
import { fetchLatestWp, parseCardsFromMarkdown, fetchHtml } from "../_animexin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Use latest WP releases as "trending" — these are the most recent uploads
    const wpItems = await fetchLatestWp(1);
    if (wpItems && wpItems.length) {
      return NextResponse.json({ data: wpItems });
    }
    // Fallback: parse homepage markdown for schedule items
    const html = await fetchHtml("/");
    const items = parseCardsFromMarkdown(html);
    return NextResponse.json({ data: items.slice(0, 30) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
