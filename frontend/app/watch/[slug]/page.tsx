"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { GogoAnimeWatchPlayer } from "@/components/gogoanime-watch-player";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function WatchPage({ params }: PageProps) {
  const { slug } = use(params);
  const [title, setTitle] = useState<string | null>(null);
  const [totalEps, setTotalEps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/streaming/gogoanime/search?q=${slug.replace(/-/g, " ")}`,
          { next: { revalidate: 300 } }
        );
        const data = await res.json();
        const match = data.data?.find((a: any) => a.slug === slug);
        if (match) {
          setTitle(match.title);
          setTotalEps(match.episodes_count || null);
        } else if (data.data?.length > 0) {
          setTitle(data.data[0].title);
          setTotalEps(data.data[0].episodes_count || null);
        } else {
          setError("Anime not found");
        }
      } catch {
        setError("Failed to load anime info");
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !title) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-void">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-mist">{error || "Anime not found"}</p>
        <Link href="/" className="text-sm text-primary-400 hover:text-primary-300">
          Go back home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-paper transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="mb-4 font-display text-2xl font-bold text-paper">{title}</h1>
        <GogoAnimeWatchPlayer slug={slug} title={title} totalEps={totalEps} />
      </div>
    </div>
  );
}
