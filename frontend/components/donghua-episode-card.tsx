import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { needsUnoptimized, hasValidImageUrl, timeAgo } from "@/lib/utils";
import type { DonghuaItem } from "@/lib/api";

interface Props {
  item: DonghuaItem;
  priority?: boolean;
}

export function DonghuaEpisodeCard({ item, priority = false }: Props) {
  const watchHref = `/donghua/watch/${item.slug}?ep=${item.episode || 1}`;
  const infoHref = `/donghua/${item.slug}`;

  return (
    <div className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(239,68,68,0.5)]">
      <Link href={watchHref} className="relative block w-full overflow-hidden aspect-[2/3]">
        {hasValidImageUrl(item.poster) ? (
          <Image
            src={item.poster}
            alt={item.title}
            fill
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            unoptimized={needsUnoptimized(item.poster)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-hi">
            <span className="text-3xl font-bold text-mist/40">{item.title?.charAt(0)}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300" />

        <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

        {item.episode && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 backdrop-blur-md shadow-lg">
            <Play className="h-3 w-3 fill-white text-white" />
            <span className="font-mono text-[11px] font-bold text-white">Ep {item.episode}</span>
          </div>
        )}

        <div className="absolute right-3 top-3 z-10 rounded-full bg-void/70 px-2.5 py-1 backdrop-blur-md">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">{item.sub_type || "Sub"}</span>
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600/80 backdrop-blur-md shadow-glow scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="h-6 w-6 fill-white text-white ml-0.5" />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <Link
            href={infoHref}
            onClick={(e) => e.stopPropagation()}
            className="block"
          >
            <h3 className="font-display text-sm font-bold leading-snug text-white line-clamp-2 hover:text-red-300 transition-colors">
              {item.title}
            </h3>
          </Link>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{item.type || "ONA"}</span>
            {item.released_at && (
              <span className="text-[10px] text-mist/60">{timeAgo(item.released_at)}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

export function DonghuaEpisodeCardSkeleton() {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-surface-hi animate-pulse">
      <div className="aspect-[2/3] w-full bg-surface-hi" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="h-4 w-3/4 rounded bg-white/10" />
        <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
      </div>
    </div>
  );
}
