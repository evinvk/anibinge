"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { api } from "@/lib/api";
import { NewsCard, NewsCardSkeleton } from "@/components/news-card";

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  summary: string;
  image: string | null;
  category: string;
  published_at: string;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .news(page, 20)
      .then((res) => {
        if (cancelled) return;
        setArticles((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
        setHasMore(res.data.length === 20);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load news");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page]);

  const featured = articles[0];
  const rest = articles.slice(1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">News</h1>
      <p className="mt-1 text-mist">Anime news, industry updates, trailers, and announcements.</p>

      {loading && articles.length === 0 ? (
        <div className="mt-8 space-y-6">
          <NewsCardSkeleton featured />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <NewsCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="mt-16 rounded-xl2 glass-card p-10 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-primary-400" />
          <p className="mt-4 text-mist">{error}</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="mt-16 rounded-xl2 glass-card p-10 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-primary-400" />
          <p className="mt-4 text-mist">No news articles found.</p>
        </div>
      ) : (
        <>
          {featured && <NewsCard article={featured} featured />}
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
                className="rounded-full border border-white/10 bg-surface-hi px-6 py-2 text-sm text-mist transition-colors hover:text-paper disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
