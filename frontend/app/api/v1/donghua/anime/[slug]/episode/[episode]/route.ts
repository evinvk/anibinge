import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto, parseDetailAuto } from "../../../../_animexin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; episode: string }> }
) {
  const { slug, episode } = await params;
  const epNum = parseInt(episode);
  if (isNaN(epNum)) return NextResponse.json({ error: "Invalid episode" }, { status: 400 });

  try {
    const detailRes = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(detailRes, slug);
    const title = detail.title || slug;

    const epEntry = detail.episode_list?.find((e: any) => e.number === epNum);
    const epUrl = epEntry?.url || `/${slug}/episode-${epNum}/`;
    const html = await fetchHtml(epUrl);
    const { servers, prev_url, next_url } = parseEpisodeServersAuto(html);

    // Find prev/next episode URLs
    const prevEntry = epNum > 1 ? detail.episode_list?.find((e: any) => e.number === epNum - 1) : null;
    const nextEntry = detail.episode_list?.find((e: any) => e.number === epNum + 1) || null;

    return NextResponse.json({
      data: {
        title,
        servers,
        prev_url: prevEntry?.url
          ? `/donghua/watch/${slug}?ep=${epNum - 1}`
          : epNum > 1 ? `/donghua/watch/${slug}?ep=${epNum - 1}` : null,
        next_url: nextEntry?.url
          ? `/donghua/watch/${slug}?ep=${epNum + 1}`
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
