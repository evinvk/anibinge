import { NextResponse } from "next/server";
import { fetchHtml, parseDetailAuto } from "../../_animexin";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const html = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(html, slug);
    if (!detail.title) {
      return NextResponse.json({ error: "Donghua not found" }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
