import { NextResponse } from "next/server";
import { fetchHtml, parseDetailAuto } from "../../_animexin";

function isEpisodePage(detail: any): boolean {
  if (detail.episode_list?.length > 0 && detail.episodes && detail.episodes > detail.episode_list.length) return false;
  if (detail.episode_list?.length >= 3) return false;
  return /\bepisode\s+\d+/i.test(detail.title || "");
}

async function tryFetchDetail(slug: string): Promise<any | null> {
  const paths = [`/${slug}/`, `/anime/${slug}/`];
  for (const path of paths) {
    try {
      const html = await fetchHtml(path);
      const detail = parseDetailAuto(html, slug);
      if (detail.title && !isEpisodePage(detail)) return detail;
    } catch {}
  }
  try {
    const html = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(html, slug);
    if (detail.title) return detail;
  } catch {}
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const detail = await tryFetchDetail(slug);
    if (!detail) {
      return NextResponse.json({ error: "Donghua not found" }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
