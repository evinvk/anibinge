import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
}

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({ currentPage, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = buildPageList(currentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("mt-12 flex items-center justify-center gap-1.5", className)}
    >
      <Link
        href={buildHref(1)}
        aria-label="First page"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
          currentPage <= 1
            ? "pointer-events-none opacity-40"
            : "border border-white/10 bg-white/5 text-mist hover:border-primary-400/40 hover:text-primary-400"
        )}
      >
        <ChevronsLeft className="h-4 w-4" />
      </Link>
      <Link
        href={buildHref(Math.max(1, currentPage - 1))}
        aria-label="Previous page"
        className={cn(
          "flex h-9 items-center gap-1 rounded-full px-3 text-sm transition-colors",
          currentPage <= 1
            ? "pointer-events-none opacity-40"
            : "border border-white/10 bg-white/5 text-mist hover:border-primary-400/40 hover:text-primary-400"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </Link>

      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className="px-1 text-mist">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors",
              p === currentPage
                ? "bg-primary-600 text-white"
                : "border border-white/10 bg-white/5 text-mist hover:border-primary-400/40 hover:text-primary-400"
            )}
          >
            {p}
          </Link>
        )
      )}

      <Link
        href={buildHref(Math.min(totalPages, currentPage + 1))}
        aria-label="Next page"
        className={cn(
          "flex h-9 items-center gap-1 rounded-full px-3 text-sm transition-colors",
          currentPage >= totalPages
            ? "pointer-events-none opacity-40"
            : "border border-white/10 bg-white/5 text-mist hover:border-primary-400/40 hover:text-primary-400"
        )}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Link>
      <Link
        href={buildHref(totalPages)}
        aria-label="Last page"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
          currentPage >= totalPages
            ? "pointer-events-none opacity-40"
            : "border border-white/10 bg-white/5 text-mist hover:border-primary-400/40 hover:text-primary-400"
        )}
      >
        <ChevronsRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
