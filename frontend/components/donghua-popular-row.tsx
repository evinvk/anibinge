import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import { needsUnoptimized, hasValidImageUrl } from "@/lib/utils";
import type { DonghuaItem } from "@/lib/api";

interface Props {
  items: DonghuaItem[];
  loading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="shrink-0 snap-start w-36 sm:w-44">
      <div className="relative overflow-hidden rounded-2xl bg-surface-hi animate-pulse">
        <div className="aspect-[2/3] w-full bg-surface-hi" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="h-4 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function DonghuaSlideCard({ item }: { item: DonghuaItem }) {
  const href = item.episode ? `/donghua/watch/${item.slug}?ep=${item.episode}` : `/donghua/watch/${item.slug}?ep=1`;

  return (
    <div className="shrink-0 snap-start w-36 sm:w-44">
      <Link href={href} className="group relative block w-full overflow-hidden aspect-[2/3] rounded-2xl transition-all duration-300 hover:shadow-[0_8px_40px_-12px_rgba(239,68,68,0.5)]">
        {hasValidImageUrl(item.poster) ? (
          <Image
            src={item.poster}
            alt={item.title}
            fill
            loading="lazy"
            sizes="176px"
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

        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <h3 className="font-display text-sm font-bold leading-snug text-white line-clamp-2 group-hover:text-red-300 transition-colors">
            {item.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-mist">{item.type || "ONA"}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function DonghuaPopularRow({ items, loading }: Props) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
            <Play className="h-4 w-4 text-red-400" />
          </div>
          <h2 className="font-display text-xl font-bold text-paper">Popular Today</h2>
        </div>
        <Link
          href="/donghua"
          className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))
          : items.map((item, idx) => (
              <DonghuaSlideCard key={`${item.slug}-${idx}`} item={item} />
            ))}
      </div>
    </section>
  );
}
