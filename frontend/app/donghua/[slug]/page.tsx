import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Star, Globe, Clock, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { needsUnoptimized, hasValidImageUrl } from "@/lib/utils";
import { AddToWatchlistButton } from "@/components/add-to-watchlist-button";

export const revalidate = 60;

function slugToId(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  try {
    const res = await api.donghuaDetail(slug);
    const d = res.data;
    return {
      title: `Watch ${d.title} — Episodes & Info | Donghua`,
      description: d.description?.slice(0, 160) || `Watch ${d.title} online free. Stream donghua episodes with subtitles.`,
      openGraph: {
        title: `Watch ${d.title} Online Free`,
        description: d.description?.slice(0, 160),
        images: d.poster ? [d.poster] : [],
      },
    };
  } catch {
    return { title: "Donghua not found" };
  }
}

export default async function DonghuaDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let detail;
  try {
    const res = await api.donghuaDetail(slug);
    detail = res.data;
  } catch {
    notFound();
  }

  if (!detail) notFound();

  const episodes = detail.episode_list || [];
  const totalEps = detail.episodes || episodes.length;

  return (
    <div className="min-h-screen bg-void">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TVSeries",
            name: detail.title,
            description: detail.description || undefined,
            image: detail.poster || undefined,
            genre: detail.genres,
            numberOfEpisodes: totalEps || undefined,
            aggregateRating: detail.score ? {
              "@type": "AggregateRating",
              ratingValue: detail.score,
              bestRating: 10,
              ratingCount: 1,
            } : undefined,
          }),
        }}
      />
      {/* Banner */}
      <div className="relative h-64 w-full overflow-hidden sm:h-80">
        {hasValidImageUrl(detail.poster) && (
          <Image
            src={detail.poster}
            alt={detail.title}
            fill
            sizes="100vw"
            className="object-cover blur-sm brightness-40"
            unoptimized={needsUnoptimized(detail.poster)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/60 to-transparent" />
      </div>

      <div className="mx-auto -mt-24 max-w-7xl px-4 sm:px-6">
        <Link
          href="/donghua"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Donghua
        </Link>

        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Poster */}
          <div className="relative -mt-4 w-40 shrink-0 overflow-hidden rounded-xl2 shadow-glow sm:w-56">
            {hasValidImageUrl(detail.poster) && (
              <Image
                src={detail.poster}
                alt={detail.title}
                width={224}
                height={336}
                priority
                className="w-full object-cover"
                unoptimized={needsUnoptimized(detail.poster)}
              />
            )}
          </div>

          <div className="flex-1 pt-4">
            <h1 className="font-display text-3xl font-bold sm:text-4xl text-paper">{detail.title}</h1>
            {detail.title_alt && <p className="text-mist mt-1">{detail.title_alt}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {detail.score && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-primary-400 text-primary-400" />
                  <span className="font-mono font-semibold">{detail.score}</span>
                </div>
              )}
              {detail.episodes && (
                <div className="flex items-center gap-1.5 text-mist">
                  <Play className="h-4 w-4" />
                  <span>{detail.episodes} episodes</span>
                </div>
              )}
              {detail.country && (
                <div className="flex items-center gap-1.5 text-mist">
                  <Globe className="h-4 w-4" />
                  <span>{detail.country}</span>
                </div>
              )}
              {detail.status && (
                <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-400 font-medium">
                  {detail.status}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {detail.genres.map((g) => (
                <Link
                  key={g}
                  href={`/browse?genres=${encodeURIComponent(g)}`}
                  className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-mist transition-colors hover:border-red-400/30 hover:text-paper"
                >
                  {g}
                </Link>
              ))}
            </div>

            <div className="mt-4">
              <AddToWatchlistButton animeId={slugToId(slug)} source="animexin" />
            </div>

            {detail.description && (
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-mist">{detail.description}</p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {detail.type && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-mist">Type</dt>
                  <dd className="mt-1 font-medium text-paper">{detail.type}</dd>
                </div>
              )}
              {detail.released && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-mist">Released</dt>
                  <dd className="mt-1 font-medium text-paper">{detail.released}</dd>
                </div>
              )}
              {detail.duration && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-mist">Duration</dt>
                  <dd className="mt-1 font-medium text-paper">{detail.duration}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Episode List */}
        <section className="mt-12 pb-16">
          <h2 className="mb-6 font-display text-xl font-bold text-paper">
            Episodes {totalEps && `(${totalEps})`}
          </h2>

          {episodes.length === 0 ? (
            <p className="text-mist">Episode list not available. Try watching directly.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {episodes.map((ep) => (
                <Link
                  key={ep.number}
                  href={`/donghua/watch/${slug}?ep=${ep.number}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:border-red-400/30 hover:bg-red-500/10"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-paper truncate">Ep {ep.number}</p>
                    <p className="text-xs text-mist truncate">{ep.title || `Episode ${ep.number}`}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {episodes.length === 0 && (
            <Link
              href={`/donghua/watch/${slug}?ep=1`}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-medium text-white transition-transform hover:scale-105"
            >
              <Play className="h-4 w-4 fill-white" />
              Watch Episode 1
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
