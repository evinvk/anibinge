import dynamic from "next/dynamic";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Star, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AnimeCard, AnimeGrid } from "@/components/anime-card";
import { AddToWatchlistButton } from "@/components/add-to-watchlist-button";

const StreamingPlayer = dynamic(
  () => import("@/components/streaming-player").then((m) => m.StreamingPlayer),
  { ssr: false, loading: () => <div className="aspect-video w-full animate-pulse rounded-xl2 bg-surface-hi" /> }
);

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { source } = await searchParams;
  try {
    const { data } = await api.detail(Number(id), source || "jikan");
    return {
      title: data.title_english || data.title,
      description: data.synopsis?.slice(0, 160),
      openGraph: {
        images: [data.images?.jpg?.large_image_url],
      },
    };
  } catch {
    return { title: "Anime not found" };
  }
}

export default async function AnimeDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { source } = await searchParams;
  const malId = Number(id);
  const resolvedSource = source || "jikan";

  let detail;
  try {
    const res = await api.detail(malId, resolvedSource);
    detail = res.data;
  } catch (err) {
    // Only show "not found" when the backend genuinely reports the anime
    // doesn't exist (404). Anything else — a Jikan timeout, a 5xx, a cold
    // Render backend waking up — is temporary, so show a retry message
    // instead of incorrectly telling the user this anime doesn't exist.
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-primary-400" />
        <h1 className="mt-4 font-display text-xl font-bold">Temporarily unavailable</h1>
        <p className="mt-2 text-sm text-mist">
          We couldn't load this anime right now — this is usually a brief hiccup with the
          upstream data source. Please refresh the page in a moment.
        </p>
      </div>
    );
  }

  const [charactersRes, recsRes] = await Promise.all([
    api.characters(malId).catch(() => ({ data: [] })),
    api.recommendations(malId).catch(() => ({ data: [] })),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: detail.title_english || detail.title,
    description: detail.synopsis,
    image: detail.images?.jpg?.large_image_url,
    aggregateRating: detail.score
      ? { "@type": "AggregateRating", ratingValue: detail.score, ratingCount: detail.scored_by }
      : undefined,
    numberOfEpisodes: detail.episodes,
    genre: detail.genres?.map((g: any) => g.name),
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Banner */}
      <div className="relative h-72 w-full overflow-hidden sm:h-96">
        {detail.trailer?.images?.maximum_image_url && (
          <Image src={detail.trailer.images.maximum_image_url} alt="" fill sizes="100vw" className="object-cover blur-sm brightness-50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void to-transparent" />
      </div>

      <div className="mx-auto -mt-32 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Poster */}
          <div className="relative -mt-4 w-40 shrink-0 overflow-hidden rounded-xl2 shadow-glow sm:w-56">
            {detail.images?.jpg?.large_image_url && (
              <Image
                src={detail.images.jpg.large_image_url}
                alt={detail.title}
                width={224}
                height={336}
                priority
                className="w-full object-cover"
              />
            )}
          </div>

          <div className="flex-1 pt-4">
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{detail.title_english || detail.title}</h1>
            <p className="text-mist">{detail.title_japanese}</p>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Stat icon={<Star className="h-4 w-4 text-primary-400" />} label="Score" value={detail.score ?? "N/A"} />
              <Stat icon={<TrendingUp className="h-4 w-4 text-primary-400" />} label="Popularity" value={`#${detail.popularity}`} />
              <Stat icon={<Users className="h-4 w-4 text-primary-400" />} label="Members" value={detail.members?.toLocaleString()} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {detail.genres?.map((g: any) => (
                <span key={g.mal_id ?? g.name} className="rounded-full bg-primary-600/20 px-3 py-1 text-xs text-primary-400">
                  {g.name}
                </span>
              ))}
            </div>

            <div className="mt-4">
              <AddToWatchlistButton animeId={malId} source={resolvedSource} />
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-mist">{detail.synopsis}</p>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Field label="Studios" value={detail.studios?.map((s: any) => s.name).join(", ")} />
              <Field label="Status" value={detail.status} />
              <Field label="Episodes" value={detail.episodes} />
              <Field label="Rating" value={detail.rating} />
            </dl>
          </div>
        </div>

        {/* Characters */}
        {charactersRes.data?.filter((c: any) => c.character?.name).length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold">Characters & Voice Actors</h2>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {charactersRes.data.filter((c: any) => c.character?.name).slice(0, 12).map((c: any) => (
                <div key={c.character.mal_id ?? c.character.id} className="glass-card w-32 shrink-0 p-2 text-center">
                  <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-full">
                    {(c.character.images?.jpg?.image_url || c.character.main_picture?.large) && (
                      <Image
                        src={c.character.images?.jpg?.image_url || c.character.main_picture?.large}
                        alt={c.character.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-medium">{c.character.name}</p>
                  <p className="text-[10px] text-mist">{c.voice_actors?.[0]?.person?.name}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* GogoAnime Streaming Player */}
        <StreamingPlayer
          animeTitle={detail.title_english || detail.title}
          anilistId={detail.anilist_id || detail.id}
        />

        {/* Recommendations */}
        {recsRes.data?.filter((r: any) => r.id && r.title).length > 0 && (
          <section className="mt-12 pb-12">
            <h2 className="font-display text-xl font-bold">You Might Also Like</h2>
            <AnimeGrid className="mt-4">
              {recsRes.data.filter((r: any) => r.id && r.title).slice(0, 12).map((r: any) => (
                <AnimeCard
                  key={r.id}
                  anime={r}
                />
              ))}
            </AnimeGrid>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-mist">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-mist">{label}</dt>
      <dd className="mt-1 font-medium">{value || "—"}</dd>
    </div>
  );
}
