"use client";

import { useEffect, useRef, useState } from "react";
import { FolderPlus, Plus, Loader2, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import clsx from "clsx";

interface CollectionSummary {
  id: string;
  name: string;
  item_count: number;
}

interface AddToCollectionProps {
  animeId: number;
  source: string;
  title: string;
  poster: string | null;
}

export function AddToCollection({ animeId, source, title, poster }: AddToCollectionProps) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [containing, setContaining] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadCollections = () => {
    if (!token) return;
    fetch("/api/v1/collections", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        setCollections(json.collections || []);
        setContaining(new Set((json.collections || []).filter((c: any) => c.contains_anime).map((c: any) => c.id)));
      })
      .catch(() => {});
  };

  useEffect(loadCollections, [token]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = async (id: string) => {
    if (!token || saving) return;
    setSaving(id);
    setError(null);
    const inCollection = containing.has(id);
    try {
      const res = await fetch(`/api/v1/collections/${id}/items${inCollection ? `?anime_id=${animeId}&source=${source}` : ""}`, {
        method: inCollection ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: inCollection ? undefined : JSON.stringify({ anime_id: animeId, source, title, poster }),
      });
      if (!res.ok) throw new Error("Failed");
      setContaining((prev) => {
        const next = new Set(prev);
        if (inCollection) next.delete(id);
        else next.add(id);
        return next;
      });
    } catch {
      setError("Couldn't update collection");
    } finally {
      setSaving(null);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || !token || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const col = await res.json();
      setCollections((prev) => [...prev, col]);
      setNewName("");
      await toggle(col.id);
    } catch {
      setError("Couldn't create collection");
    } finally {
      setCreating(false);
    }
  };

  if (!token) {
    return (
      <button
        onClick={() => {}}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-mist transition hover:bg-white/10"
        title="Log in to create collections"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        Collections
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => { setOpen((p) => !p); loadCollections(); }}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-paper transition hover:bg-white/10"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        Add to collection
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/10 bg-surface-hi p-2 shadow-xl">
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-mist">My collections</p>
          <div className="max-h-48 overflow-y-auto">
            {collections.length === 0 && (
              <p className="px-2 py-1 text-xs text-mist">No collections yet — create one below.</p>
            )}
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                disabled={saving !== null}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-paper transition hover:bg-white/5 disabled:opacity-50"
              >
                <span className="truncate">{c.name}</span>
                <span className="flex items-center gap-1.5">
                  {c.item_count > 0 && <span className="text-mist">{c.item_count}</span>}
                  {saving === c.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-mist" />
                  ) : containing.has(c.id) ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-mist" />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-white/10 pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder="New collection name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-void/60 px-2 py-1.5 text-xs text-paper placeholder:text-mist/60 focus:border-primary-400/40 focus:outline-none"
            />
            <button
              onClick={create}
              disabled={creating || !newName.trim()}
              className={clsx("flex items-center rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:opacity-40")}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
            </button>
          </div>
          {error && <p className="mt-1 px-2 text-[11px] text-amber-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
