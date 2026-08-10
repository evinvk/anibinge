"use client";

import { useEffect, useState } from "react";
import { MessageSquare, ThumbsUp, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import Link from "next/link";
import clsx from "clsx";

interface AnimeComment {
  id: number;
  user_id: string;
  username: string;
  body: string;
  likes: number;
  liked_by_me: boolean;
  created_at: string;
}

export function AnimeCommentsSection({ animeId, source }: { animeId: number; source: string }) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState<AnimeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/v1/anime-comments?anime_id=${animeId}&source=${source}`)
      .then((r) => r.json())
      .then((json) => setComments(json.comments || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [animeId, source]);

  const post = async () => {
    const body = draft.trim();
    if (!body || !token) return;
    setPosting(true);
    setError(null);
    try {
      await api.postAnimeComment(token, animeId, source, body);
      setDraft("");
      load();
    } catch (err: any) {
      setError(err?.message || "Couldn't post your comment — try again");
    } finally {
      setPosting(false);
    }
  };

  const like = async (id: number) => {
    if (!token) return;
    try {
      const json = await api.likeAnimeComment(token, id);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, likes: json.likes, liked_by_me: json.liked } : c)));
    } catch {}
  };

  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <MessageSquare className="h-5 w-5 text-primary-400" />
        Discussion {comments.length > 0 && <span className="text-sm font-normal text-mist">({comments.length})</span>}
      </h2>

      <div className="mt-4 rounded-xl border border-white/10 bg-surface-hi p-4">
        {user ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What do you think of this anime?"
              maxLength={2000}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-paper placeholder:text-mist/60 focus:border-primary-400/40 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-mist">Posting as {user.username}</span>
              <button
                onClick={post}
                disabled={posting || !draft.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:opacity-40"
              >
                {posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Post comment
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-mist">
            <Link href="/login" className="font-semibold text-primary-400 hover:underline">Log in</Link>{" "}
            or{" "}
            <Link href="/signup" className="font-semibold text-primary-400 hover:underline">sign up</Link>{" "}
            to join the discussion.
          </p>
        )}
        {error && <p className="mt-2 text-xs text-amber-400">{error}</p>}
      </div>

      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-mist">Loading comments…</p>}
        {!loading && comments.length === 0 && (
          <p className="text-sm text-mist">No comments yet. Start the discussion!</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/10 bg-surface-hi p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-paper">{c.username}</span>
              <span className="text-xs text-mist">{new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-mist">{c.body}</p>
            <button
              onClick={() => like(c.id)}
              className={clsx(
                "mt-2 flex items-center gap-1 text-xs transition",
                c.liked_by_me ? "text-primary-400" : "text-mist hover:text-paper"
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {c.likes > 0 ? c.likes : "Like"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
