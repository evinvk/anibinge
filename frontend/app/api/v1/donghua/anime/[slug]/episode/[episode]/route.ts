import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServers, parseDetail } from "../../../../_animexin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; episode: string }> }
) {
  const { slug, episode } = await params;
  const epNum = parseInt(episode);
  if (isNaN(epNum)) return NextResponse.json({ error: "Invalid episode" }, { status: 400 });

  try {
    const detailRes = await fetchHtml(`/${slug}/`);
    const detail = parseDetail(detailRes, slug);
    const title = detail.title || slug;

    const epUrl = `/${slug}/episode-${epNum}/`;
    const html = await fetchHtml(epUrl);
    const { servers, prev_url, next_url } = parseEpisodeServers(html);

    return NextResponse.json({
      data: {
        title,
        servers,
        prev_url: epNum > 1 ? `/donghua/watch/${slug}?ep=${epNum - 1}` : null,
        next_url: detail.episodes && epNum < detail.episodes
          ? `/donghua/watch/${slug}?ep=${epNum + 1}` : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
