import { NextResponse } from "next/server";
import {
  getChapters as getChaptersMD,
  getMangaDetail as getMangaDetailMD,
  type ChapterData,
  CACHE_HEADERS,
} from "../../../_mangadex";
import { getChapters as getChaptersCK, resolveHidByTitle } from "../../../_comick";

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const mdRes = await getChaptersMD(id).catch(() => ({ data: [] }));
    const md = mdRes.data || [];
    const mdReadable = md.filter((ch) => !ch.externalUrl);

    let merged = md;

    // MangaDex English coverage for manhwa is often thin (0-5 chapters, many external-only).
    // When it is, top the list up with ComicK's complete chapter set. ComicK entries stay as
    // external links (its image endpoint is CF-gated server-side) but point to free pages.
    if (mdReadable.length < 20) {
      try {
        const detail = await getMangaDetailMD(id);
        const hid = await resolveHidByTitle(detail.title);
        if (hid) {
          const ckRes = await getChaptersCK(hid).catch(() => ({ data: [] }));
          const ck = ckRes.data || [];
          if (ck.length > 0) {
            const byKey = new Map<string, ChapterData>();
            for (const ch of ck) byKey.set(chapterKey(ch), ch);
            for (const ch of md) {
              if (!ch.externalUrl) byKey.set(chapterKey(ch), ch);
              else if (!byKey.has(chapterKey(ch))) byKey.set(chapterKey(ch), ch);
            }
            merged = [...byKey.values()];
          }
        }
      } catch {
        // keep MangaDex list on resolution failure
      }
    }

    return NextResponse.json({ data: sortAsc(merged) }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
