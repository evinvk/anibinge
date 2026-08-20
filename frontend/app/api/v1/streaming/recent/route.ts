import { NextResponse } from "next/server";
import { cachedFetch } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GOGO_BASE = "https://gogoanimehd.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const JINA = "https://r.jina.ai";
const PAGE_SIZE = 30;

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit") || String(PAGE_SIZE))));

  try {
    const payload = await cachedFetch(
      `recent:v8:${page}:${limit}`,
      120000,
      () => buildRecent(page, limit),
      60000
    );
    return NextResponse.json({ ...payload, _version: "v8-gogo-html" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: any) {
    return NextResponse.json({ data: [], page, has_next: false, _version: "v8-error", error: e?.message }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}

async function buildRecent(page: number, limit: number) {
  const episodes = await scrapeGogoLatestEpisodes();
  if (episodes.length === 0) {
    return { data: [], page, has_next: false };
  }

  const start = (page - 1) * limit;
  const target = episodes.slice(start, start + limit);

  const items = target.map((ep) => ({
    title: ep.title,
    episode: ep.episode,
    poster: ep.image,
    slug: ep.slug,
    aired_ago: 0,
    genres: [],
    anilist_id: null,
  })).filter((item) => item.episode != null && item.episode > 0);

  return {
    data: items,
    page,
    has_next: episodes.length > start + limit,
  };
}

interface GogoEpisode {
  slug: string;
  title: string;
  image: string;
  episode: number;
}

async function scrapeGogoLatestEpisodes(): Promise<GogoEpisode[]> {
  // Try direct fetch first
  let html = "";
  try {
    const resp = await fetch(GOGO_BASE, {
      headers: { "User-Agent": UA, Referer: `${GOGO_BASE}/` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) html = await resp.text();
  } catch {}

  // Fallback to Jina reader
  if (!html || html.length < 1000) {
    const resp = await fetch(`${JINA}/${GOGO_BASE}`, {
      headers: { "User-Agent": UA, "X-Return-Format": "html" },
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) throw new Error(`Jina ${resp.status}`);
    html = await resp.text();
  }

  if (!html || html.length < 1000) throw new Error("Empty response from GogoAnime");

  return parseEpisodesFromHtml(html);
}

/**
 * Parse episodes from GogoAnime HTML.
 * Strategy: Find all card-like structures that contain both an anime link and an episode badge.
 * Each card has: <img src="POSTER" alt="TITLE"> + <a href="/anime/SLUG"> + >ep N</div>
 */
function parseEpisodesFromHtml(html: string): GogoEpisode[] {
  const episodes: GogoEpisode[] = [];
  const seen = new Set<string>();

  // Strategy 1: Find each "ep N" badge and work backwards to find the closest /anime/SLUG link
  // The HTML has cards structured as:
  // <div class="...">...<img src="POSTER" alt="TITLE" ...>...>ep N</div>...<a href="/anime/SLUG">...<h3 ... title="TITLE">
  const epBadgeRegex = />(ep \d+)<\/(?:div|span)>/gi;
  let match;

  while ((match = epBadgeRegex.exec(html)) !== null) {
    const epNum = parseInt(match[1].replace("ep ", ""));
    const badgePos = match.index;

    // Look backwards up to 5000 chars for the anime slug and poster
    const lookbackStart = Math.max(0, badgePos - 5000);
    const before = html.slice(lookbackStart, badgePos);

    // Find the LAST href="/anime/SLUG" before this badge (closest match)
    const slugMatches = [...before.matchAll(/href="\/anime\/([^"]+)"/g)];
    if (slugMatches.length === 0) continue;
    const slug = slugMatches[slugMatches.length - 1][1];
    if (seen.has(slug)) continue;

    // Find the LAST img src before this badge (closest match)
    const imgMatches = [...before.matchAll(/src="(https?:\/\/[^"]+(?:\.jpg|\.png|\.webp|\.jpeg)[^"]*)"/g)];
    const image = imgMatches.length > 0 ? imgMatches[imgMatches.length - 1][1] : "";

    // Find title from title="TITLE" or alt="TITLE" near the slug link
    const titleFromSlug = before.match(new RegExp(`href="/anime/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[^<]*<h3[^>]*title="([^"]+)"`));
    const titleFromAlt = before.match(/alt="([^"]+)"/);
    const title = titleFromSlug?.[1] || titleFromAlt?.[1] || slug.replace(/-/g, " ");

    seen.add(slug);
    episodes.push({ slug, title, image, episode: epNum });
  }

  // Strategy 2: If no episodes found, try parsing RSC payload
  if (episodes.length === 0) {
    return parseFromRscPayload(html);
  }

  return episodes;
}

/**
 * Fallback: Parse episodes from Next.js RSC payload embedded in script tags.
 * The RSC data contains entries like: "episode":"ep 12","totalEpisodes":12
 */
function parseFromRscPayload(html: string): GogoEpisode[] {
  const episodes: GogoEpisode[] = [];
  const seen = new Set<string>();

  // Find all self.__next_f.push([1,"..."]) blocks
  const pushRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let pushMatch;
  let inOngoing = true;

  while ((pushMatch = pushRegex.exec(html)) !== null) {
    const raw = pushMatch[1];

    // Check for section boundaries — stop after "Completed" or genre sections
    if (raw.includes("Completed Series") || raw.includes("Completed</span>")) {
      inOngoing = false;
    }
    if (raw.includes("Action Anime") || raw.includes("Fantasy Anime")) {
      inOngoing = false;
    }
    if (!inOngoing) continue;

    // Unescape the RSC content: \" → "
    const content = raw.replace(/\\"/g, '"');

    // Match "$L2f","SLUG",{...} entries with episode field
    const cardRegex = /\$L2f","([^"]+)",\{[^}]*?"episode":"ep (\d+)"[^}]*?\}/g;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(content)) !== null) {
      const slug = cardMatch[1];
      if (seen.has(slug)) continue;
      seen.add(slug);

      // Extract fields from the surrounding JSON
      const ctx = content.slice(cardMatch.index, cardMatch.index + cardMatch[0].length + 300);
      const titleMatch = ctx.match(/"titleEnglish":"([^"]+)"/) || ctx.match(/"title":"([^"]+)"/);
      const imgMatch = ctx.match(/"image":"([^"]+)"/);

      episodes.push({
        slug,
        title: titleMatch?.[1] || slug.replace(/-/g, " "),
        image: imgMatch?.[1] || "",
        episode: parseInt(cardMatch[2]),
      });
    }
  }

  return episodes;
}
