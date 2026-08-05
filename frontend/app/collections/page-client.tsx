"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Trash2, FolderPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AuthForms } from "@/components/auth-forms";

interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export default function CollectionsPage() {
  const { token, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-mist">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">My Collections</h1>
      <p className="mt-1 text-mist">Create custom lists and organize your anime.</p>

      {!token ? (
        <div className="mt-8">
          <AuthForms />
        </div>
      ) : (
        <CollectionsList token={token} />
      )}
    </div>
  );
}

function CollectionsList({ token }: { token: string }) {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/v1/collections", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => setCollections(json.collections || []))
      .catch(() => setError("Couldn't load your collections."));
  };

  useEffect(load, [token]);

  const create = async () => {
    const clean = name.trim();
    if (!clean || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) throw new Error();
      setName("");
      load();
    } catch {
      setError("Couldn't create collection.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/collections/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCollections((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch {}
  };

  return (
    <>
      <div className="mt-6 flex max-w-md gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          placeholder="New collection name"
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-surface-hi px-3 py-2 text-sm text-paper placeholder:text-mist/60 focus:border-primary-400/40 focus:outline-none"
        />
        <button
          onClick={create}
          disabled={creating || !name.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:opacity-40"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}

      {collections === null ? (
        <p className="mt-16 text-center text-mist">Loading your collections…</p>
      ) : collections.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center text-mist">
          <FolderPlus className="h-10 w-10 text-mist/40" />
          <p className="mt-3">No collections yet. Create one to start organizing your anime.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <div key={c.id} className="group relative rounded-xl border border-white/10 bg-surface-hi p-5 transition hover:border-white/20">
              <Link href={`/collections/${c.id}`} className="block">
                <h2 className="font-display text-lg font-bold text-paper group-hover:text-primary-400">{c.name}</h2>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-mist">{c.description}</p>}
                <p className="mt-3 text-xs text-mist">
                  {c.item_count} {c.item_count === 1 ? "anime" : "anime"}
                </p>
              </Link>
              <button
                onClick={() => remove(c.id)}
                className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                aria-label="Delete collection"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
