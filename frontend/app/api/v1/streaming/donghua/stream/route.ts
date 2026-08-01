export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  fetchHtml,
  parseEpisodeServersAuto,
  parseDetailAuto,
  resolveAnimeXinSeriesUrl,
  filterLiveServers,
  BASE,
} from "../../../donghua/_animexin";

const EP_URL_PATTERNS = [
  (s: string, e: number) => `/${s}-episode-${e}-indonesia-english-sub/`,
  (s: string, e: number) => `/${s}-episode-${e}-subtitle-indonesia-english/`,
  (s: string, e: number) => `/${s}-episode-${e}-indonesia-english/`,
];

async function tryFetchEpPage(slug: string, ep: number): Promise<string | null> {
  for (const pattern of EP_URL_PATTERNS) {
    try {
      const html = await fetchHtml(pattern(slug, ep));
      const parsed = parseEpisodeServersAuto(html);
      if (parsed.servers?.length > 0) return html;
    } catch {}
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!slug) return NextResponse.json({ error: "No slug" }, { status: 400 });

  try {
    const resolvedPath = await resolveAnimeXinSeriesUrl(slug);
    if (resolvedPath) {
      const html = await fetchHtml(resolvedPath);
      const detail = parseDetailAuto(html, slug);
      const epEntry = detail.episode_list?.find((e: any) => e.number === ep);
      if (epEntry?.url) {
        const epPage = await fetchHtml(epEntry.url.replace(BASE, ""));
        const parsed = parseEpisodeServersAuto(epPage);
        const servers = await filterLiveServers(parsed.servers || []);
        if (servers.length) {
          return NextResponse.json({
            data: {
              servers: servers.map((s: any) => ({
                label: s.label || "Server",
                stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
              })),
            },
          });
        }
      }
    }
  } catch {}

  const epPage = await tryFetchEpPage(slug, ep);
  if (epPage) {
    const parsed = parseEpisodeServersAuto(epPage);
    const servers = await filterLiveServers(parsed.servers || []);
    if (servers.length) {
      return NextResponse.json({
        data: {
          servers: servers.map((s: any) => ({
            label: s.label || "Server",
            stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
          })),
        },
      });
    }
  }

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
