import { query } from "./db";

interface CommentRow {
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
  liked_by: string[];
  created_at: string;
}

function enrichComment(c: CommentRow, requestUserId: string | null) {
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
    replies_count: c.replies_count ?? 0,
    is_resolved: c.is_resolved,
    liked_by_me: requestUserId ? (c.liked_by || []).includes(requestUserId) : false,
    created_at: c.created_at,
    replies: [] as any[],
  };
}

const ORDER_SQL: Record<string, string> = {
  oldest: "created_at ASC",
  popular: "likes DESC, created_at DESC",
  newest: "created_at DESC",
};

export async function getComments(slug: string, episodeNumber: number, sort: string): Promise<{ comments: any[]; total: number }> {
  const order = ORDER_SQL[sort] || ORDER_SQL.newest;
  const rows = await query<CommentRow>(
    `SELECT *, (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id) AS replies_count
     FROM comments c WHERE c.slug = $1 AND c.episode_number = $2 AND c.parent_id IS NULL
     ORDER BY ${order}`,
    [slug, episodeNumber],
  );
  const total = await query(`SELECT count(*)::int AS c FROM comments WHERE slug = $1 AND episode_number = $2 AND parent_id IS NULL`, [slug, episodeNumber]);
  return { comments: rows.map((c) => enrichComment(c, null)), total: total[0].c };
}

export async function createComment(userId: string, username: string, body: { slug: string; episode_number: number; body: string; tag: string; parent_id: number | null }): Promise<any> {
  if (body.parent_id) {
    const parent = await query(`SELECT 1 FROM comments WHERE id = $1 AND slug = $2 AND episode_number = $3`, [body.parent_id, body.slug, body.episode_number]);
    if (parent.length === 0) throw new Error("Parent comment not found");
  }
  const rows = await query<CommentRow>(
    `INSERT INTO comments (slug, episode_number, user_id, username, body, tag, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [body.slug, body.episode_number, userId, username || "User", body.body, body.tag, body.parent_id || null],
  );
  return enrichComment({ ...rows[0], replies_count: 0 }, null);
}

export async function toggleLike(commentId: number, userId: string): Promise<{ liked: boolean; likes: number }> {
  const rows = await query<{ likes: number; liked_by: string[] }>(`SELECT likes, liked_by FROM comments WHERE id = $1`, [commentId]);
  if (rows.length === 0) throw new Error("Comment not found");
  const c = rows[0];
  const likedBy = c.liked_by || [];
  const alreadyLiked = likedBy.includes(userId);
  const nextLikedBy = alreadyLiked ? likedBy.filter((x) => x !== userId) : [...likedBy, userId];
  const nextLikes = alreadyLiked ? Math.max(0, c.likes - 1) : c.likes + 1;
  await query(`UPDATE comments SET liked_by = $1, likes = $2 WHERE id = $3`, [nextLikedBy, nextLikes, commentId]);
  return { liked: !alreadyLiked, likes: nextLikes };
}

export async function toggleResolve(commentId: number): Promise<{ is_resolved: boolean }> {
  const rows = await query<{ is_resolved: boolean }>(
    `UPDATE comments SET is_resolved = NOT is_resolved WHERE id = $1 RETURNING is_resolved`,
    [commentId],
  );
  if (rows.length === 0) throw new Error("Comment not found");
  return { is_resolved: rows[0].is_resolved };
}

export async function deleteComment(commentId: number): Promise<{ deleted: boolean }> {
  const rows = await query(`DELETE FROM comments WHERE id = $1 RETURNING id`, [commentId]);
  if (rows.length === 0) throw new Error("Comment not found");
  return { deleted: true };
}

export async function listIssues(opts: { slug?: string; resolved?: boolean; limit?: number; offset?: number }): Promise<{ issues: any[]; total: number }> {
  const where = ["tag IN ('report', 'issue')"];
  const params: any[] = [];
  if (opts.slug) {
    params.push(opts.slug);
    where.push(`slug = $${params.length}`);
  }
  if (opts.resolved !== undefined) {
    params.push(opts.resolved);
    where.push(`is_resolved = $${params.length}`);
  }
  const whereSql = where.join(" AND ");
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = await query<CommentRow>(
    `SELECT id, slug, episode_number, body, tag, is_resolved, username, created_at
     FROM comments WHERE ${whereSql}
     ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const totalRows = await query<{ c: number }>(`SELECT count(*)::int AS c FROM comments WHERE ${whereSql}`, params);
  const issues = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    episode_number: r.episode_number,
    body: r.body,
    tag: r.tag,
    is_resolved: r.is_resolved,
    username: r.username,
    created_at: r.created_at,
  }));
  return { issues, total: totalRows[0]?.c ?? 0 };
}

export async function getReplies(slug: string, episodeNumber: number, parentId: number): Promise<any[]> {
  const rows = await query<CommentRow>(
    `SELECT * FROM comments WHERE slug = $1 AND episode_number = $2 AND parent_id = $3 ORDER BY created_at ASC`,
    [slug, episodeNumber, parentId],
  );
  return rows.map((c) => enrichComment(c, null));
}
