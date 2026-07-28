const comments = new Map<string, any[]>();
const nextId = { value: 1 };

export interface StoredComment {
  id: number;
  user_id: string;
  username: string;
  slug: string;
  episode_number: number;
  body: string;
  tag: string;
  parent_id: number | null;
  likes: number;
  replies_count: number;
  is_resolved: boolean;
  liked_by: Set<string>;
  created_at: string;
}

export function getComments(slug: string, episodeNumber: number, sort: string) {
  const key = `${slug}:${episodeNumber}`;
  const all = (comments.get(key) || []).filter((c) => !c.parent_id);
  const sorted = [...all].sort((a, b) => {
    if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sort === "popular") return b.likes - a.likes;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return { comments: sorted.map((c) => enrichComment(c, null)), total: sorted.length };
}

export function createComment(userId: string, username: string, body: { slug: string; episode_number: number; body: string; tag: string; parent_id: number | null }) {
  const key = `${body.slug}:${body.episode_number}`;
  if (!comments.has(key)) comments.set(key, []);

  if (body.parent_id) {
    const parent = comments.get(key)?.find((c) => c.id === body.parent_id);
    if (!parent) throw new Error("Parent comment not found");
  }

  const comment: StoredComment = {
    id: nextId.value++,
    user_id: userId,
    username: username || "User",
    slug: body.slug,
    episode_number: body.episode_number,
    body: body.body,
    tag: body.tag,
    parent_id: body.parent_id || null,
    likes: 0,
    replies_count: 0,
    is_resolved: false,
    liked_by: new Set(),
    created_at: new Date().toISOString(),
  };

  comments.get(key)!.push(comment);

  if (body.parent_id) {
    const parent = comments.get(key)!.find((c) => c.id === body.parent_id);
    if (parent) parent.replies_count++;
  }

  return enrichComment(comment, null);
}

export function toggleLike(commentId: number, userId: string) {
  for (const [, list] of comments) {
    const c = list.find((c) => c.id === commentId);
    if (c) {
      if (c.liked_by.has(userId)) {
        c.liked_by.delete(userId);
        c.likes = Math.max(0, c.likes - 1);
        return { liked: false, likes: c.likes };
      } else {
        c.liked_by.add(userId);
        c.likes++;
        return { liked: true, likes: c.likes };
      }
    }
  }
  throw new Error("Comment not found");
}

export function toggleResolve(commentId: number) {
  for (const [, list] of comments) {
    const c = list.find((c) => c.id === commentId);
    if (c) {
      c.is_resolved = !c.is_resolved;
      return { is_resolved: c.is_resolved };
    }
  }
  throw new Error("Comment not found");
}

export function deleteComment(commentId: number) {
  for (const [, list] of comments) {
    const idx = list.findIndex((c) => c.id === commentId);
    if (idx !== -1) {
      list.splice(idx, 1);
      return { deleted: true };
    }
  }
  throw new Error("Comment not found");
}

export function getReplies(slug: string, episodeNumber: number, parentId: number) {
  const key = `${slug}:${episodeNumber}`;
  const all = (comments.get(key) || []).filter((c) => c.parent_id === parentId);
  return all.map((c) => enrichComment(c, null));
}

function enrichComment(c: StoredComment, requestUserId: string | null) {
  return {
    id: c.id,
    user_id: c.user_id,
    username: c.username,
    avatar_url: null,
    slug: c.slug,
    episode_number: c.episode_number,
    body: c.body,
    tag: c.tag,
    parent_id: c.parent_id,
    likes: c.likes,
    replies_count: c.replies_count,
    is_resolved: c.is_resolved,
    liked_by_me: requestUserId ? c.liked_by.has(requestUserId) : false,
    created_at: c.created_at,
    replies: [] as any[],
  };
}
