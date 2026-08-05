import { query } from "./db";

interface AnimeCommentRow {
  id: number;
  anime_id: number;
  source: string;
  user_id: string;
  username: string;
  body: string;
  likes: number;
  liked_by: string[];
  created_at: string;
}

export async function getAnimeComments(animeId: number, source: string, requestUserId: string | null) {
  const rows = await query<AnimeCommentRow>(
    `SELECT * FROM anime_comments WHERE anime_id = $1 AND source = $2 ORDER BY created_at DESC LIMIT 200`,
    [animeId, source],
  );
  return rows.map((c) => ({
    id: c.id,
    user_id: c.user_id,
    username: c.username,
    body: c.body,
    likes: c.likes,
    liked_by_me: requestUserId ? (c.liked_by || []).includes(requestUserId) : false,
    created_at: c.created_at,
  }));
}

export async function createAnimeComment(userId: string, username: string, animeId: number, source: string, body: string) {
  const clean = body.trim().slice(0, 2000);
  if (!clean) throw new Error("Comment body is empty");
  const rows = await query<AnimeCommentRow>(
    `INSERT INTO anime_comments (anime_id, source, user_id, username, body) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, username, animeId, source, clean],
  );
  const c = rows[0];
  return {
    id: c.id,
    user_id: c.user_id,
    username: c.username,
    body: c.body,
    likes: 0,
    liked_by_me: false,
    created_at: c.created_at,
  };
}

export async function toggleAnimeCommentLike(commentId: number, userId: string) {
  const rows = await query<AnimeCommentRow>(`SELECT * FROM anime_comments WHERE id = $1`, [commentId]);
  if (rows.length === 0) throw new Error("Comment not found");
  const c = rows[0];
  const liked = (c.liked_by || []).includes(userId);
  const newLikedBy = liked ? (c.liked_by || []).filter((u) => u !== userId) : [...(c.liked_by || []), userId];
  const updated = await query<AnimeCommentRow>(
    `UPDATE anime_comments SET likes = $1, liked_by = $2 WHERE id = $3 RETURNING *`,
    [newLikedBy.length, newLikedBy, commentId],
  );
  return { liked: !liked, likes: updated[0].likes };
}
