export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  fetchHtml,
  parseEpisodeServersAuto,
  parseDetailAuto,
  BASE,
} from "../../../donghua/_animexin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!slug) return NextResponse.json({ error: "No slug" }, { status: 400 });

  try {
    const detailRes = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(detailRes, slug);
    const epEntry = detail.episode_list?.find((e: any) => e.number === ep);
    const epUrl =
      epEntry?.url?.replace(BASE, "") ||
      `/${slug}-episode-${ep}-indonesia-english-sub/`;

    const epPage = await fetchHtml(epUrl);
    const parsed = parseEpisodeServersAuto(epPage);

    if (parsed.servers?.length) {
      return NextResponse.json({
        data: {
          servers: parsed.servers.map((s: any) => ({
            label: s.label || "Server",
            stream_url: s.stream_url.startsWith("//")
              ? `https:${s.stream_url}`
              : s.stream_url,
          })),
        },
      });
    }
  } catch {}

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
