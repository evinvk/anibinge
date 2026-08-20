import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto, parseDetailAuto, filterLiveServers, BASE } from "../../../../_animexin";

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
    const epEntry = detail.episode_list?.find((e: any) => e.number === epNum);
    const epUrl = epEntry?.url?.replace(BASE, "") || `/${slug}-episode-${epNum}-indonesia-english-sub/`;

    const html = await fetchHtml(epUrl);
    const parsed = parseEpisodeServersAuto(html);
    const servers = await filterLiveServers(parsed.servers || []);

    if (servers.length) {
      const prevEntry = epNum > 1 ? detail.episode_list?.find((e: any) => e.number === epNum - 1) : null;
      return NextResponse.json({
        data: {
          title: detail.title || slug,
          servers: servers.map((s: any) => ({
            label: s.label || "Server",
            stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
          })),
          prev_url: prevEntry?.url ? `/donghua/watch/${slug}?ep=${epNum - 1}` : epNum > 1 ? `/donghua/watch/${slug}?ep=${epNum - 1}` : null,
          next_url: `/donghua/watch/${slug}?ep=${epNum + 1}`,
        },
      });
    }
  } catch {}

  return NextResponse.json({ error: "Failed to fetch servers" }, { status: 503 });
}
