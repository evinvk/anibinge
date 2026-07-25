"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Send, Trash2, AlertTriangle, Info, Loader2 } from "lucide-react";
import { api, EpisodeCommentData } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import clsx from "clsx";

interface Props {
  slug: string;
  episodeNumber: number;
}

const TAG_OPTIONS = [
  { value: "comment", label: "Comment", icon: MessageCircle },
  { value: "report", label: "Report Issue", icon: AlertTriangle },
  { value: "issue", label: "Not Working", icon: Info },
] as const;

export function EpisodeComments({ slug, episodeNumber }: Props) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState<EpisodeCommentData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>("comment");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getComments(slug, episodeNumber);
      setComments(data.comments);
      setTotal(data.total);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, [slug, episodeNumber]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!token || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const newComment = await api.postComment(token, slug, episodeNumber, body.trim(), tag);
      setComments((prev) => [newComment, ...prev]);
      setTotal((prev) => prev + 1);
      setBody("");
      setTag("comment");
    } catch (err: any) {
      setError(err?.message || "Failed to post comment");
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: number) => {
    if (!token) return;
    try {
      await api.deleteComment(token, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => prev - 1);
    } catch {
      /* silent */
    }
  };

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary-400" />
        <h3 className="font-display text-sm font-bold">Episode Comments</h3>
        {total > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-mist">{total}</span>
        )}
      </div>

      {token ? (
        <div className="mt-3">
          <div className="flex gap-1.5 mb-2">
            {TAG_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTag(value)}
                className={clsx(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  tag === value
                    ? value === "issue"
                      ? "bg-red-500/20 text-red-400"
                      : value === "report"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-primary-600 text-white"
                    : "bg-white/5 text-mist hover:bg-white/10"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
              placeholder={tag === "issue" ? "This episode is not loading..." : tag === "report" ? "Describe the issue..." : "Leave a comment..."}
              maxLength={2000}
              className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-paper placeholder:text-mist/50 outline-none focus:ring-1 focus:ring-primary-500 transition"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !body.trim()}
              className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-mist">
          <a href="/login" className="text-primary-400 hover:text-primary-300 underline">Log in</a> to leave a comment or report an issue.
        </p>
      )}

      {loading ? (
        <div className="mt-4 flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-mist" />
        </div>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-xs text-mist/60">No comments yet. Be the first to report an issue or leave feedback.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                {c.tag === "issue" && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Not Working</span>}
                {c.tag === "report" && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Report</span>}
                <span className="text-xs font-medium text-paper">{c.username}</span>
                <span className="text-[10px] text-mist/50">
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <div className="flex-1" />
                {(user?.id === c.user_id || user?.is_admin) && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-mist/40 hover:text-red-400 transition"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-mist">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
