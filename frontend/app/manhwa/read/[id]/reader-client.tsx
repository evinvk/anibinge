"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, AlertTriangle, BookOpen, ExternalLink } from "lucide-react";
import { api, type ChapterInfo, type ManhwaItem } from "@/lib/api";
import { needsUnoptimized } from "@/lib/utils";
import { EpisodeComments } from "@/components/episode-comments";

interface Props {
  chapterId: string;
  mangaId: string | null;
}

export default function ManhwaReaderClient({ chapterId, mangaId }: Props) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.manhwaChapterPages(chapterId),
      mangaId ? api.manhwaChapters(mangaId) : Promise.resolve({ data: [] }),
      mangaId ? api.manhwaDetail(mangaId) : Promise.resolve({ data: null }),
    ]).then(([p, c, d]) => {
      setPages(p.data.pages);
      setChapters(c.data || []);
      setMangaTitle(d.data?.title || "");
      setLoading(false);
    }).catch(() => {
      setError("Failed to load chapter.");
      setLoading(false);
    });
  }, [chapterId, mangaId]);

  const currentIdx = chapters.findIndex((ch) => ch.id === chapterId);
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  const goToPrev = useCallback(() => {
    if (prevChapter) window.location.href = `/manhwa/read/${prevChapter.id}?manga=${mangaId}`;
  }, [prevChapter, mangaId]);

  const goToNext = useCallback(() => {
    if (nextChapter) window.location.href = `/manhwa/read/${nextChapter.id}?manga=${mangaId}`;
  }, [nextChapter, mangaId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || (pages.length === 0 && !loading)) {
    const externalUrl = chapters[currentIdx]?.externalUrl;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-4">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-center text-mist">
          {error || (externalUrl ? "This chapter is hosted externally." : "No pages available for this chapter.")}
        </p>
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Read on {new URL(externalUrl).hostname.replace("www.", "")}
          </a>
        ) : mangaId ? (
          <Link href={`/manhwa/${mangaId}`} className="text-sm text-emerald-400 hover:underline">Back to details</Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-void/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href={mangaId ? `/manhwa/${mangaId}` : "/manhwa"} className="text-mist hover:text-paper transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-sm text-paper truncate max-w-[200px] sm:max-w-md">
            {mangaTitle} — Chapter {chapters[currentIdx]?.chapter || ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {prevChapter && (
            <button onClick={goToPrev} className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-mist hover:text-paper transition-colors">
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
          )}
          {nextChapter && (
            <button onClick={goToNext} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-400 transition-colors">
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center">
        {pages.map((pageUrl, i) => (
          <div key={i} className="relative w-full">
            <Image
              src={pageUrl}
              alt={`Page ${i + 1}`}
              width={800}
              height={1200}
              className="h-auto w-full"
              unoptimized={needsUnoptimized(pageUrl)}
              loading={i < 3 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 px-4 py-8">
        {prevChapter && (
          <button onClick={goToPrev} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-mist hover:text-paper transition-colors">
            <ChevronLeft className="h-5 w-5" />
            Chapter {prevChapter.chapter}
          </button>
        )}
        <Link href={mangaId ? `/manhwa/${mangaId}` : "/manhwa"} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors">
          <BookOpen className="h-5 w-5" />
          Details
        </Link>
        {nextChapter && (
          <button onClick={goToNext} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors">
            Chapter {nextChapter.chapter}
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-12">
        <EpisodeComments slug={chapterId} episodeNumber={0} issuePlaceholder="This chapter is not loading, or shows a blank page..." />
      </div>
    </div>
  );
}
