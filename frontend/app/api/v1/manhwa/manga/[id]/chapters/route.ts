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

// Prefer the provider's readable chapters; keep MangaDex chapters that aren't
// already covered by the same chapter number (readable ones win over the
// provider's, external ones fill gaps).
function mergeReadable(provider: ChapterData[], md: ChapterData[]): ChapterData[] {
  const byKey = new Map<string, ChapterData>();
  for (const ch of provider) byKey.set(chapterKey(ch), ch);
  for (const ch of md) {
    if (!ch.externalUrl) byKey.set(chapterKey(ch), ch);
    else if (!byKey.has(chapterKey(ch))) byKey.set(chapterKey(ch), ch);
  }
  return [...byKey.values()];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const mdRes = await getChaptersMD(id).catch(() => ({ data: [] }));
    const md = mdRes.data || [];
    const mdReadable = md.filter((ch) => !ch.externalUrl);

    let merged = md;

    // MangaDex English coverage for manhwa is often thin (0-5 chapters, many
    // external-only). When it is, top the list up: Asura first (free, readable
    // in-app — server-fetchable CDN), then ComicK (external free mirror, since
    // its images are browser-locked).
    if (mdReadable.length < 20) {
      try {
        const detail = await getMangaDetailMD(id);

        const slug = await resolveSeriesByTitle(detail.title);
        if (slug) {
          const asRes = await getChaptersAS(slug).catch(() => ({ data: [] }));
          const asura = asRes.data || [];
          if (asura.length > 0) merged = mergeReadable(asura, md);
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
    }

    return NextResponse.json({ data: sortAsc(merged) }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
