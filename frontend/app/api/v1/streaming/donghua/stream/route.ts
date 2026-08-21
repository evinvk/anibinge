import { NextResponse } from "next/server";
import {
  fetchHtmlFast,
  fetchRawHtml,
  parseEpisodeServersFromMarkdown,
  parseEpisodeServersFromRawHtml,
  resolveAnimeXinSeriesUrlFast,
} from "../../../donghua/_animexin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeServers(raw: { label: string; stream_url: string }[]) {
  return raw.map((s) => ({
    label: s.label || "Server",
    stream_url: s.stream_url.startsWith("//") ? `https:${s.stream_url}` : s.stream_url,
  }));
}

function extractAnimexinSlug(resolvedPath: string): string {
  return resolvedPath.replace(/^\/anime\//, "").replace(/\/$/, "");
}

function buildEpisodePatterns(slug: string, ep: number) {
  return [
    `/${slug}-episode-${ep}-indonesia-english-sub/`,
    `/${slug}-episode-${ep}-subtitle-indonesia-english/`,
    `/${slug}-episode-${ep}-indonesia-english/`,
    `/${slug}-ep${ep}/`,
    `/${slug}-episode-${ep}/`,
  ];
}

async function tryDirectFetch(slugs: string[], ep: number) {
  for (const slug of slugs) {
    const patterns = buildEpisodePatterns(slug, ep);
    for (const path of patterns) {
      try {
        const html = await fetchRawHtml(path);
        if (html.length < 200) continue;
        const servers = parseEpisodeServersFromRawHtml(html);
        if (servers.length) return normalizeServers(servers);
      } catch {}
    }
  }
  return null;
}

async function tryJinaFetch(slugs: string[], ep: number) {
  for (const slug of slugs) {
    const patterns = buildEpisodePatterns(slug, ep);
    const results = await Promise.allSettled(
      patterns.map(async (path) => {
        try {
          const html = await fetchHtmlFast(path);
          const parsed = parseEpisodeServersFromMarkdown(html);
          if (parsed.servers?.length) return parsed.servers;
        } catch {}
        return null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.length) {
        return normalizeServers(r.value);
      }
    }
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("q") || "";
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!slug) return NextResponse.json({ error: "No slug" }, { status: 400 });

  const resolvedPath = await resolveAnimeXinSeriesUrlFast(slug);
  const resolvedSlug = resolvedPath ? extractAnimexinSlug(resolvedPath) : null;

  const misspelled = slug.replace(/rou/g, "ro");
  const slugCandidates: string[] = [];
  if (resolvedSlug) slugCandidates.push(resolvedSlug);
  if (!slugCandidates.includes(slug)) slugCandidates.push(slug);
  if (misspelled !== slug && !slugCandidates.includes(misspelled)) slugCandidates.push(misspelled);

  const directServers = await tryDirectFetch(slugCandidates, ep);
  if (directServers?.length) {
    return NextResponse.json({ data: { servers: directServers } });
  }

  const jinaServers = await tryJinaFetch(slugCandidates, ep);
  if (jinaServers?.length) {
    return NextResponse.json({ data: { servers: jinaServers } });
  }

  return NextResponse.json({ error: "No stream found" }, { status: 404 });
}
