export const runtime = "edge";

import { NextResponse } from "next/server";
import { fetchHtml, parseEpisodeServersAuto, parseDetailAuto, BASE } from "../../../donghua/_animexin";

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
      // 503 = Render cold start, retry after delay
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

async function fetchAnimeXin(slug: string, ep: number): Promise<any | null> {
  try {
    const detailRes = await fetchHtml(`/${slug}/`);
    const detail = parseDetailAuto(detailRes, slug);
    const epEntry = detail.episode_list?.find((e: any) => e.number === ep);
    const epUrl = epEntry?.url?.replace(BASE, "") || `/${slug}/episode-${ep}/`;
    const epPage = await fetchHtml(epUrl);
    const parsed = parseEpisodeServersAuto(epPage);
    if (parsed.servers?.length) {
      return {
        data: {
          servers: parsed.servers.map((s: any) => ({
            label: s.label || "Server",
            stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
          })),
        },
      };
    }
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!slug) return NextResponse.json({ error: "No slug" }, { status: 400 });

  // Try backend first (it has working Python scraper)
  let result = await fetchBackend(slug, ep);
  if (result) return NextResponse.json(result);

  // Fallback: frontend scraper
  result = await fetchAnimeXin(slug, ep);
  if (result) return NextResponse.json(result);

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
