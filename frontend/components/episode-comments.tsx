"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle, Send, Trash2, AlertTriangle, Info, Loader2,
  ThumbsUp, CornerDownRight, ArrowUpDown, CheckCircle2, CircleDot,
  ChevronDown, ChevronUp
} from "lucide-react";
import { api, EpisodeCommentData } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import clsx from "clsx";

interface Props {
  slug: string;
  episodeNumber: number;
}

const TAGS = [
  { value: "comment", label: "Comment", icon: MessageCircle, color: "" },
  { value: "report", label: "Report", icon: AlertTriangle, color: "amber" },
  { value: "issue", label: "Not Working", icon: CircleDot, color: "red" },
] as const;

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CommentItem({
  c, slug, token, user, onReply, onDelete, onLike, onResolve, depth = 0,
}: {
  c: EpisodeCommentData; slug: string; token: string | null; user: any;
  onReply: (parentId: number) => void; onDelete: (id: number) => void;
  onLike: (id: number) => void; onResolve: (id: number) => void; depth?: number;
}) {
  const [showReplies, setShowReplies] = useState(true);
  const isIssue = c.tag === "issue" || c.tag === "report";
  const canDelete = user && (user.id === c.user_id || user.is_admin);

  return (
    <div className={clsx("group", depth > 0 && "ml-6 pl-4 border-l border-white/5")}>
      <div className={clsx(
        "rounded-xl px-4 py-3 transition",
        isIssue && !c.is_resolved && "bg-red-500/5 border border-red-500/10",
        isIssue && c.is_resolved && "bg-green-500/5 border border-green-500/10",
        !isIssue && "bg-white/[0.03] hover:bg-white/[0.06]",
      )}>
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600/20 text-[11px] font-bold text-primary-400 uppercase">
            {c.username?.[0] || "?"}
          </div>
          <span className="text-sm font-semibold text-paper">{c.username}</span>
          {isIssue && (
            <span className={clsx(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              c.tag === "issue" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400",
            )}>
              {c.tag === "issue" ? "Not Working" : "Report"}
            </span>
          )}
          {c.is_resolved && (
            <span className="flex items-center gap-0.5 rounded-md bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
              <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
            </span>
          )}
          <span className="text-[11px] text-mist/40">{timeAgo(c.created_at)}</span>
          <div className="flex-1" />
          {/* Actions */}
          {user && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onLike(c.id)} className={clsx(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition",
                c.liked_by_me ? "text-primary-400 bg-primary-500/10" : "text-mist/40 hover:text-mist",
              )}>
                <ThumbsUp className="h-3 w-3" />
                {c.likes > 0 && <span>{c.likes}</span>}
              </button>
              <button onClick={() => onReply(c.id)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-mist/40 hover:text-mist transition">
                <CornerDownRight className="h-3 w-3" /> Reply
              </button>
              {user.is_admin && isIssue && (
                <button onClick={() => onResolve(c.id)} className={clsx(
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition",
                  c.is_resolved ? "text-amber-400 hover:text-amber-300" : "text-green-400 hover:text-green-300",
                )}>
                  <CheckCircle2 className="h-3 w-3" />
                  {c.is_resolved ? "Unresolve" : "Resolve"}
                </button>
              )}
              {canDelete && (
                <button onClick={() => onDelete(c.id)} className="rounded-md px-1.5 py-0.5 text-[11px] text-mist/30 hover:text-red-400 transition">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        {/* Body */}
        <p className="mt-2 text-sm leading-relaxed text-mist whitespace-pre-wrap break-words">{c.body}</p>
      </div>

      {/* Replies */}
      {c.replies && c.replies.length > 0 && (
        <div className="mt-1">
          {depth === 0 && c.replies.length > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="ml-6 flex items-center gap-1 py-1 text-[11px] text-primary-400 hover:text-primary-300 transition"
            >
              {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {c.replies.length} {c.replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
          {showReplies && c.replies.map((r) => (
            <CommentItem
              key={r.id} c={r} slug={slug} token={token} user={user}
              onReply={onReply} onDelete={onDelete} onLike={onLike} onResolve={onResolve}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EpisodeComments({ slug, episodeNumber }: Props) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState<EpisodeCommentData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>("comment");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getComments(slug, episodeNumber, sort);
      setComments(data.comments);
      setTotal(data.total);
    } catch (err: any) {
      console.error("Failed to load comments:", err);
      setLoadError(err?.message || "Failed to load comments");
    }
    setLoading(false);
  }, [slug, episodeNumber, sort]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async () => {
    if (!token || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const newComment = await api.postComment(token, slug, episodeNumber, body.trim(), tag, replyTo ?? undefined);
      setBody(""); setTag("comment"); setReplyTo(null);
      if (newComment.parent_id) {
        const addReply = (list: EpisodeCommentData[]): EpisodeCommentData[] =>
          list.map((c) => c.id === newComment.parent_id
            ? { ...c, replies: [...(c.replies || []), newComment], replies_count: (c.replies_count || 0) + 1 }
            : { ...c, replies: addReply(c.replies || []) });
        setComments(addReply);
      } else {
        setComments((prev) => [newComment, ...prev]);
      }
      setTotal((prev) => prev + 1);
    } catch (err: any) {
      console.error("Comment post failed:", err);
      setError(err?.message || "Failed to post comment. Please try again.");
    }
    setSubmitting(false);
  };

  const handleLike = async (commentId: number) => {
    if (!token) return;
    try {
      const res = await api.likeComment(token, commentId);
      const update = (list: EpisodeCommentData[]): EpisodeCommentData[] =>
        list.map((c) => c.id === commentId ? { ...c, likes: res.likes, liked_by_me: res.liked } : { ...c, replies: c.replies ? update(c.replies) : [] });
      setComments(update(comments));
    } catch (err) { console.error("Like failed:", err); }
  };

  const handleDelete = async (commentId: number) => {
    if (!token) return;
    try {
      await api.deleteComment(token, commentId);
      await fetchComments();
    } catch (err) { console.error("Delete failed:", err); }
  };

  const handleResolve = async (commentId: number) => {
    if (!token) return;
    try {
      const res = await api.resolveComment(token, commentId);
      const update = (list: EpisodeCommentData[]): EpisodeCommentData[] =>
        list.map((c) => c.id === commentId ? { ...c, is_resolved: res.is_resolved } : { ...c, replies: c.replies ? update(c.replies) : [] });
      setComments(update(comments));
    } catch (err) { console.error("Resolve failed:", err); }
  };

  const replyTarget = replyTo ? findComment(comments, replyTo) : null;

  return (
    <section className="mt-8 border-t border-white/5 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary-400" />
          <h3 className="font-display text-lg font-bold">Community</h3>
          {total > 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-mist">{total}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(["newest", "oldest", "popular"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition capitalize",
                sort === s ? "bg-primary-600 text-white" : "text-mist/50 hover:text-mist hover:bg-white/5",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">Could not connect to server.</span> {loadError}
            <span className="block text-[11px] text-red-400/60 mt-0.5">Open browser console (F12) for details.</span>
          </div>
        </div>
      )}

      {/* Compose */}
      {token ? (
        <div className="mt-4 rounded-xl bg-white/[0.03] p-4 border border-white/5">
          {replyTarget && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary-500/10 px-3 py-1.5 text-xs">
              <CornerDownRight className="h-3 w-3 text-primary-400" />
              <span className="text-mist">Replying to <span className="font-semibold text-paper">{replyTarget.username}</span></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-mist/50 hover:text-mist text-[10px]">Cancel</button>
            </div>
          )}
          <div className="flex gap-2 mb-2">
            {TAGS.map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => { if (!replyTo) setTag(value); }}
                disabled={!!replyTo}
                className={clsx(
                  "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  tag === value && !replyTo
                    ? color === "red" ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                    : color === "amber" ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
                    : "bg-primary-600 text-white"
                    : "text-mist/50 hover:bg-white/5",
                  replyTo && "opacity-40 cursor-not-allowed",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              rows={2}
              maxLength={2000}
              placeholder={
                replyTo ? "Write your reply..."
                : tag === "issue" ? "This episode is not loading, buffering, or has no video..."
                : tag === "report" ? "Describe the issue you found..."
                : "Leave a comment, share your thoughts..."
              }
              className="flex-1 resize-none rounded-lg bg-white/5 px-4 py-2.5 text-sm text-paper placeholder:text-mist/30 outline-none focus:ring-1 focus:ring-primary-500 transition"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-mist/30">Ctrl+Enter to send</span>
            <button
              onClick={handleSubmit}
              disabled={submitting || !body.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {replyTo ? "Reply" : "Post"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white/[0.03] p-6 border border-white/5 text-center">
          <p className="text-sm text-mist">
            <a href="/login" className="text-primary-400 hover:text-primary-300 font-semibold underline underline-offset-2">Log in</a>
            {" "}or{" "}
            <a href="/signup" className="text-primary-400 hover:text-primary-300 font-semibold underline underline-offset-2">Sign up</a>
            {" "}to join the discussion, report issues, or leave feedback.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">Failed to post.</span> {error}
            <span className="block text-[11px] text-red-400/60 mt-0.5">Open browser console (F12) for details.</span>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400 text-xs shrink-0">Dismiss</button>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-mist/40" />
        </div>
      ) : comments.length === 0 ? (
        <div className="py-12 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-mist/20" />
          <p className="mt-3 text-sm text-mist/40">No comments yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {comments.map((c) => (
            <CommentItem
              key={c.id} c={c} slug={slug} token={token} user={user}
              onReply={(id) => { setReplyTo(id); setTag("comment"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onDelete={handleDelete} onLike={handleLike} onResolve={handleResolve}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function findComment(list: EpisodeCommentData[], id: number): EpisodeCommentData | null {
  for (const c of list) {
    if (c.id === id) return c;
    if (c.replies) {
      const found = findComment(c.replies, id);
      if (found) return found;
    }
  }
  return null;
}
