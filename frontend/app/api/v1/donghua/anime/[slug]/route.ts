import { NextResponse } from "next/server";
import { fetchHtml, parseDetailAuto, resolveAnimeXinSeriesUrl } from "../../_animexin";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const resolvedPath = await resolveAnimeXinSeriesUrl(slug);
    if (!resolvedPath) {
      return NextResponse.json({ error: "Donghua not found" }, { status: 404 });
    }
    const html = await fetchHtml(resolvedPath);
    const detail = parseDetailAuto(html, slug);
    return NextResponse.json({ data: detail });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
