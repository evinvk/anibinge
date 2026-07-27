import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DonghuaWatchPlayer from "@/components/donghua-watch-player";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}

async function fetchDonghuaTitle(slug: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/donghua/anime/${slug}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.data?.title) return data.data.title;
  } catch {}
  return slug.replace(/-/g, " ");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = await fetchDonghuaTitle(slug);
  return {
    title: `Watch ${title} — Donghua Episodes Online`,
    description: `Watch ${title} donghua online free. Stream episodes with subtitles.`,
  };
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void">
      <Loader2 className="h-8 w-8 animate-spin text-red-400" />
    </div>
  );
}

export default function DonghuaWatchPage({ params }: PageProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DonghuaWatchPageInner params={params} />
    </Suspense>
  );
}

async function DonghuaWatchPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DonghuaWatchPlayer slug={slug} />;
}
