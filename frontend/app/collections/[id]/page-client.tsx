"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Trash2, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface CollectionItem {
  anime_id: number;
  source: string;
  title: string;
  poster: string | null;
  added_at: string;
}

interface CollectionDetail {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  items: CollectionItem[];
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user, loading: authLoading } = useAuth();
  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/collections/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => { if (!cancelled) setCollection(json); })
      .catch(() => { if (!cancelled) setError("This collection doesn't exist or is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const removeItem = async (animeId: number, source: string) => {
    if (!token) return;
    setRemoving(animeId);
    try {
      const res = await fetch(`/api/v1/collections/${id}/items?anime_id=${animeId}&source=${source}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCollection((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.anime_id !== animeId) } : prev));
    } catch {
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-mist">Loading collection…</div>;
  }

  if (error || !collection) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-mist">{error ?? "Not found"}</div>;
  }

  const owned = !!user && user.id === collection.user_id;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/collections" className="text-xs text-mist hover:text-paper hover:underline">
            ← My Collections
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold">{collection.name}</h1>
          {collection.description && <p className="mt-1 text-mist">{collection.description}</p>}
          <p className="mt-2 text-xs text-mist">
            {collection.items.length} {collection.items.length === 1 ? "anime" : "anime"}
            {!owned && (
              <span className="ml-2 inline-flex items-center gap-1 text-mist/70">
                <Lock className="h-3 w-3" /> private
              </span>
            )}
          </p>
        </div>
      </div>

      {collection.items.length === 0 ? (
        <p className="mt-16 text-center text-mist">
          This collection is empty. Browse anime and tap "Add to collection" to fill it up.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {collection.items.map((item) => {
            const href = item.source === "anilist" ? `/anime/${item.anime_id}?source=anilist` : `/anime/${item.anime_id}`;
            return (
              <div key={`${item.source}:${item.anime_id}`} className="group relative overflow-hidden rounded-xl bg-surface-hi">
                <Link href={href}>
                  <div className="relative aspect-[2/3] w-full bg-surface">
                    {item.poster && (
                      <Image src={item.poster} alt={item.title} fill unoptimized className="object-cover" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-sm font-medium text-paper">{item.title}</p>
                  </div>
                </Link>
                {owned && (
                  <button
                    onClick={() => removeItem(item.anime_id, item.source)}
                    disabled={removing === item.anime_id}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 disabled:opacity-40"
                    aria-label="Remove from collection"
                  >
                    {removing === item.anime_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
