export const runtime = "edge";

import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto, parseDetailAuto, BASE } from "../../../../_animexin";

const BACKEND = "https://anibinge-backend-k6td.onrender.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function fetchBackend(slug: string, ep: number): Promise<any | null> {
  const url = `${BACKEND}/api/v1/donghua/anime/${encodeURIComponent(slug)}/episode/${ep}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.data?.servers?.length) return data;
      }
      if (resp.status === 503) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      return null;
    } catch {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
  }
  return null;
}

async function fetchAnimeXin(slug: string, epNum: number): Promise<any | null> {
  try {
    const detailRes = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(detailRes, slug);
    const epEntry = detail.episode_list?.find((e: any) => e.number === epNum);
    const epUrl = epEntry?.url?.replace(BASE, "") || `/${slug}/episode-${epNum}/`;
    const html = await fetchHtml(epUrl);
    const { servers, prev_url, next_url } = parseEpisodeServersAuto(html);
    if (servers?.length) {
      return {
        data: {
          title: detail.title || slug,
          servers: servers.map((s: any) => ({
            label: s.label || "Server",
            stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
          })),
          prev_url: prev_url ? `/donghua/watch/${slug}?ep=${epNum - 1}` : null,
          next_url: next_url ? `/donghua/watch/${slug}?ep=${epNum + 1}` : null,
        },
      };
    }
  } catch {}
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; episode: string }> }
) {
  const { slug, episode } = await params;
  const epNum = parseInt(episode);
  if (isNaN(epNum)) return NextResponse.json({ error: "Invalid episode" }, { status: 400 });

  let result = await fetchBackend(slug, epNum);
  if (result) return NextResponse.json(result);

  result = await fetchAnimeXin(slug, epNum);
  if (result) return NextResponse.json(result);

  return NextResponse.json({ error: "Failed to fetch servers" }, { status: 503 });
}
