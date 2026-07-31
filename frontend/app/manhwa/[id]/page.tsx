"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock, Loader2, AlertTriangle, Star, ExternalLink } from "lucide-react";
import Image from "next/image";
import { api, type ManhwaItem, type ChapterInfo } from "@/lib/api";
import { needsUnoptimized, hasValidImageUrl } from "@/lib/utils";

export default function ManhwaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [manga, setManga] = useState<ManhwaItem | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.manhwaDetail(id),
      api.manhwaChapters(id),
    ]).then(([d, c]) => {
      setManga(d.data);
      setChapters(c.data || []);
      setLoading(false);
    }).catch(() => {
      setError("Failed to load manhwa details.");
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-void">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-mist">{error || "Not found"}</p>
        <Link href="/manhwa" className="text-sm text-emerald-400 hover:underline">Back to Manhwa</Link>
      </div>
    );
  }

  const readableChapters = chapters.filter((ch) => !ch.externalUrl);
  const firstReadable = readableChapters[0] || chapters[0];

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/manhwa" className="mb-6 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Manhwa
        </Link>

        <div className="flex flex-col gap-8 md:flex-row">
          <div className="w-full shrink-0 md:w-64">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl2 shadow-lg">
              {hasValidImageUrl(manga.poster) ? (
                <Image src={manga.poster} alt={manga.title} fill className="object-cover" unoptimized={needsUnoptimized(manga.poster)} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-hi">
                  <span className="text-4xl font-bold text-mist/40">{manga.title?.charAt(0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold text-paper">{manga.title}</h1>

            <div className="mt-4 flex flex-wrap gap-3">
              {manga.rating && (
                <div className="flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-sm text-amber-400">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {manga.rating}
                </div>
              )}
              <div className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400">
                <BookOpen className="h-3.5 w-3.5" />
                {chapters.length} chapters
              </div>
              {manga.status && (
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-mist">
                  {manga.status}
                </div>
              )}
            </div>

            {manga.genres?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {manga.genres.map((g) => (
                  <span key={g} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-mist">{g}</span>
                ))}
              </div>
            )}

            {manga.description && (
              <p className="mt-6 text-sm leading-relaxed text-mist line-clamp-5">{manga.description}</p>
            )}

            {chapters.length > 0 && firstReadable && (
              readableChapters.length > 0 ? (
                <Link
                  href={`/manhwa/read/${firstReadable.id}?manga=${id}`}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-400"
                >
                  <BookOpen className="h-4 w-4" />
                  Read Chapter {firstReadable.chapter}
                </Link>
              ) : (
                <a
                  href={firstReadable.externalUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-400"
                >
                  <ExternalLink className="h-4 w-4" />
                  Read Chapter {firstReadable.chapter}
                </a>
              )
            )}
          </div>
        </div>

        {chapters.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 font-display text-xl font-bold text-paper">Chapters</h2>
            <div className="flex flex-col gap-1">
              {chapters.map((ch) => (
                ch.externalUrl ? (
                  <a
                    key={ch.id}
                    href={ch.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <ExternalLink className="h-4 w-4 text-mist" />
                      <span className="text-sm text-paper">
                        Chapter {ch.chapter}{ch.title ? `: ${ch.title}` : ""}
                      </span>
                    </div>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">External</span>
                  </a>
                ) : (
                  <Link
                    key={ch.id}
                    href={`/manhwa/read/${ch.id}?manga=${id}`}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm text-paper">
                        Chapter {ch.chapter}{ch.title ? `: ${ch.title}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-mist">
                      <span>{ch.pages} pages</span>
                      <Clock className="h-3 w-3" />
                    </div>
                  </Link>
                )
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
