import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { needsUnoptimized, hasValidImageUrl } from "@/lib/utils";
import type { DonghuaItem } from "@/lib/api";

interface DonghuaCardProps {
  item: DonghuaItem;
  priority?: boolean;
}

export function DonghuaCard({ item, priority = false }: DonghuaCardProps) {
  const href = `/donghua/${item.slug}`;

  return (
    <Link href={href} className="group block h-full">
      <div className="glass-card aura-border flex h-full flex-col transition-transform duration-200 group-hover:-translate-y-1">
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-t-xl2">
          {hasValidImageUrl(item.poster) ? (
            <Image
              src={item.poster}
              alt={item.title}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              unoptimized={needsUnoptimized(item.poster)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-hi">
              <span className="text-2xl font-bold text-mist/40">{item.title?.charAt(0)}</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-card-sheen opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />

          {item.episode && (
            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-void/70 px-2 py-1 backdrop-blur-md">
              <Play className="h-3 w-3 fill-white text-white" />
              <span className="font-mono text-[10px] text-white">Ep {item.episode}</span>
            </div>
          )}

          <div className="absolute right-2 top-2 rounded-full bg-red-500/80 px-2 py-1 backdrop-blur-md">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-white">Donghua</span>
          </div>
        </div>

        <div className="flex h-28 flex-col justify-start p-3">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-paper">
            {item.title}
          </h3>
          <p className="mt-1 truncate text-xs text-mist">
            {item.type || "ONA"} {item.sub_type ? `· ${item.sub_type}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function DonghuaCardSkeleton() {
  return (
    <div className="glass-card w-full animate-pulse">
      <div className="aspect-[2/3] w-full rounded-t-xl2 bg-surface-hi" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 rounded bg-surface-hi" />
        <div className="h-3 w-1/2 rounded bg-surface-hi" />
      </div>
    </div>
  );
}
