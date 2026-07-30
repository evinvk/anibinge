export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  fetchHtml,
  parseEpisodeServersAuto,
  parseDetailAuto,
  BASE,
} from "../../../donghua/_animexin";

const EP_URL_PATTERNS = [
  (s: string, e: number) => `/${s}-episode-${e}-indonesia-english-sub/`,
  (s: string, e: number) => `/${s}-episode-${e}-subtitle-indonesia-english/`,
  (s: string, e: number) => `/${s}-episode-${e}-indonesia-english/`,
];

function isEpisodePage(detail: any): boolean {
  if (detail.episode_list?.length > 0 && detail.episodes && detail.episodes > detail.episode_list.length) return false;
  if (detail.episode_list?.length >= 3) return false;
  return /\bepisode\s+\d+/i.test(detail.title || "");
}

async function fetchDetailPage(slug: string): Promise<{ html: string; slug: string } | null> {
  const paths = [`/${slug}/`, `/anime/${slug}/`];
  for (const p of paths) {
    try {
      const html = await fetchHtml(p);
      const detail = parseDetailAuto(html, slug);
      if (detail.title && !isEpisodePage(detail)) return { html, slug };
    } catch {}
  }
  return null;
}

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
    const detail = await fetchDetailPage(slug);
    if (detail) {
      const epEntry = parseDetailAuto(detail.html, slug).episode_list?.find((e: any) => e.number === ep);
      if (epEntry?.url) {
        const epPage = await fetchHtml(epEntry.url.replace(BASE, ""));
        const parsed = parseEpisodeServersAuto(epPage);
        if (parsed.servers?.length) {
          return NextResponse.json({
            data: {
              servers: parsed.servers.map((s: any) => ({
                label: s.label || "Server",
                stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
              })),
            },
          });
        }
      }
    }

    const epPage = await tryFetchEpPage(slug, ep);
    if (epPage) {
      const parsed = parseEpisodeServersAuto(epPage);
      if (parsed.servers?.length) {
        return NextResponse.json({
          data: {
            servers: parsed.servers.map((s: any) => ({
              label: s.label || "Server",
              stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
            })),
          },
        });
      }
    }
  } catch {}

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
