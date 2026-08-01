import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ManhwaPageClient from "./manhwa-page-client";
import { SITE_URL } from "@/lib/seo";
import type { ManhwaItem } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
const MANHWA_TOTAL_PAGES = 373;

interface ManhwaPageProps {
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ searchParams }: ManhwaPageProps): Promise<Metadata> {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const canonical = `${SITE_URL}/manhwa${page > 1 ? `?page=${page}` : ""}`;
  return {
    title: page === 1 ? "Manhwa — Korean Comics" : `Manhwa — Page ${page} of ${MANHWA_TOTAL_PAGES}`,
    description:
      page === 1
        ? "Browse and read manhwa online free. Discover trending Korean webtoons and comics with English translations."
        : `Browse manhwa online free — page ${page} of ${MANHWA_TOTAL_PAGES}. Discover Korean webtoons and comics with English translations on Anibinge.`,
    alternates: { canonical },
    openGraph: {
      title: page === 1 ? "Manhwa — Korean Comics | Anibinge" : `Manhwa — Page ${page} of ${MANHWA_TOTAL_PAGES} | Anibinge`,
      description:
        page === 1
          ? "Browse and read manhwa online free. Discover trending Korean webtoons and comics with English translations."
          : `Browse manhwa online free — page ${page} of ${MANHWA_TOTAL_PAGES}.`,
      url: canonical,
    },
  };
}

async function fetchTrending(page: number): Promise<ManhwaItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/manhwa/trending?page=${page}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export default async function ManhwaPage({ searchParams }: ManhwaPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));

  const initialItems = await fetchTrending(page);

  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    }>
      <ManhwaPageClient initialItems={initialItems} currentPage={page} totalPages={MANHWA_TOTAL_PAGES} />
    </Suspense>
  );
}
