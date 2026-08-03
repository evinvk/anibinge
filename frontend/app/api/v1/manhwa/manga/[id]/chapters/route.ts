import { NextResponse } from "next/server";
import {
  getChapters as getChaptersMD,
  getMangaDetail as getMangaDetailMD,
  type ChapterData,
  CACHE_HEADERS,
} from "../../../_mangadex";
import { getChapters as getChaptersCK, resolveHidByTitle } from "../../../_comick";
import { getChapters as getChaptersAS, resolveSeriesByTitle } from "../../../_asura";

export const runtime = "nodejs";

function chapterKey(ch: ChapterData): string {
  const n = parseFloat(ch.chapter);
  return Number.isFinite(n) ? `n${n}` : `s${ch.chapter}`;
}

function sortAsc(chapters: ChapterData[]): ChapterData[] {
  return [...chapters].sort((a, b) => {
    const an = parseFloat(a.chapter);
    const bn = parseFloat(b.chapter);
    const av = Number.isFinite(an) ? an : Number.MAX_VALUE;
    const bv = Number.isFinite(bn) ? bn : Number.MAX_VALUE;
    return av - bv;
  });
}

// When providerWins is true the provider's chapters win on overlap (used for
// Asura, whose images are reliable and readable in-app); otherwise readable
// MangaDex chapters win (used for ComicK, whose chapters are external links).
function mergeReadable(provider: ChapterData[], md: ChapterData[], providerWins = false): ChapterData[] {
  const byKey = new Map<string, ChapterData>();
  for (const ch of provider) byKey.set(chapterKey(ch), ch);
  for (const ch of md) {
    if (!ch.externalUrl && !providerWins) byKey.set(chapterKey(ch), ch);
    else if (!byKey.has(chapterKey(ch))) byKey.set(chapterKey(ch), ch);
  }
  return [...byKey.values()];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const mdRes = await getChaptersMD(id).catch(() => ({ data: [] }));
    const md = mdRes.data || [];

    let merged = md;

    // Asura Scans is the primary source for manhwa: it's free, has full
    // chapter lists, and its CDN is server-fetchable (readable in-app). Try it
    // for every title, keeping MangaDex's readable chapters as supplements;
    // ComicK (external mirror) is only a last-resort fallback when Asura
    // yields nothing.
    try {
      const detail = await getMangaDetailMD(id);

      const slug = await resolveSeriesByTitle(detail.title);
      if (slug) {
        const asRes = await getChaptersAS(slug).catch(() => ({ data: [] }));
        const asura = asRes.data || [];
        if (asura.length > 0) merged = mergeReadable(asura, md, true);
      }

      if (merged.length === md.length) {
        const hid = await resolveHidByTitle(detail.title);
        if (hid) {
          const ckRes = await getChaptersCK(hid).catch(() => ({ data: [] }));
          const ck = ckRes.data || [];
          if (ck.length > 0) merged = mergeReadable(ck, md);
        }
      }
    } catch {
      // keep MangaDex list on resolution failure
    }

    return NextResponse.json({ data: sortAsc(merged) }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
