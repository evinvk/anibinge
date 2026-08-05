import { query } from "./db";

export async function getRatingSummary(animeId: number, source: string, requestUserId: string | null) {
  const agg = await query<{ avg: number; cnt: number }>(
    `SELECT COALESCE(AVG(rating), 0)::float AS avg, COUNT(*)::int AS cnt FROM anime_ratings WHERE anime_id = $1 AND source = $2`,
    [animeId, source],
  );
  let myRating: number | null = null;
  if (requestUserId) {
    const mine = await query<{ rating: number }>(
      `SELECT rating FROM anime_ratings WHERE user_id = $1 AND anime_id = $2 AND source = $3`,
      [requestUserId, animeId, source],
    );
    myRating = mine[0]?.rating ?? null;
  }
  return { average: Math.round(agg[0].avg * 10) / 10, count: agg[0].cnt, my_rating: myRating };
}

export async function upsertRating(userId: string, animeId: number, source: string, rating: number) {
  const clamped = Math.max(1, Math.min(10, Math.round(rating)));
  await query(
    `INSERT INTO anime_ratings (user_id, anime_id, source, rating)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, anime_id, source) DO UPDATE SET rating = $4, updated_at = now()`,
    [userId, animeId, source, clamped],
  );
  return getRatingSummary(animeId, source, userId);
}

export async function deleteRating(userId: string, animeId: number, source: string) {
  await query(`DELETE FROM anime_ratings WHERE user_id = $1 AND anime_id = $2 AND source = $3`, [userId, animeId, source]);
  return getRatingSummary(animeId, source, userId);
}
