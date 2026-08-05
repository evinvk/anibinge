import { query } from "./db";
import { randomUUID } from "crypto";

export interface CollectionItemInput {
  anime_id: number;
  source: string;
  title: string;
  poster: string | null;
}

export async function listCollections(userId: string) {
  const rows = await query(
    `SELECT c.*, (SELECT count(*)::int FROM collection_items i WHERE i.collection_id = c.id) AS item_count
     FROM collections c WHERE c.user_id = $1 ORDER BY c.updated_at DESC`,
    [userId],
  );
  return rows;
}

export async function createCollection(userId: string, name: string, description: string | null) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Collection name is required");
  const id = randomUUID();
  const rows = await query(
    `INSERT INTO collections (id, user_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, userId, clean, description?.trim().slice(0, 300) || null],
  );
  return { ...rows[0], item_count: 0 };
}

export async function getCollection(collectionId: string) {
  const rows = await query(`SELECT * FROM collections WHERE id = $1`, [collectionId]);
  if (rows.length === 0) return null;
  const items = await query(
    `SELECT anime_id, source, title, poster, added_at FROM collection_items WHERE collection_id = $1 ORDER BY added_at DESC`,
    [collectionId],
  );
  return { ...rows[0], items };
}

export async function deleteCollection(collectionId: string, userId: string) {
  const rows = await query(`DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id`, [collectionId, userId]);
  if (rows.length === 0) throw new Error("Collection not found");
  return rows[0];
}

export async function addItem(collectionId: string, userId: string, item: CollectionItemInput) {
  const owned = await query(`SELECT id FROM collections WHERE id = $1 AND user_id = $2`, [collectionId, userId]);
  if (owned.length === 0) throw new Error("Collection not found");
  await query(
    `INSERT INTO collection_items (collection_id, anime_id, source, title, poster)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (collection_id, anime_id, source) DO UPDATE SET title = EXCLUDED.title, poster = EXCLUDED.poster, added_at = now()`,
    [collectionId, item.anime_id, item.source, item.title.slice(0, 300), item.poster?.slice(0, 1000) || null],
  );
  await query(`UPDATE collections SET updated_at = now() WHERE id = $1`, [collectionId]);
  return { added: true };
}

export async function removeItem(collectionId: string, userId: string, animeId: number, source: string) {
  const owned = await query(`SELECT id FROM collections WHERE id = $1 AND user_id = $2`, [collectionId, userId]);
  if (owned.length === 0) throw new Error("Collection not found");
  await query(`DELETE FROM collection_items WHERE collection_id = $1 AND anime_id = $2 AND source = $3`, [collectionId, animeId, source]);
  await query(`UPDATE collections SET updated_at = now() WHERE id = $1`, [collectionId]);
  return { removed: true };
}

export async function collectionsContainingAnime(userId: string, animeId: number, source: string) {
  const rows = await query(
    `SELECT c.id, c.name FROM collections c
     WHERE c.user_id = $1 AND EXISTS (
       SELECT 1 FROM collection_items i WHERE i.collection_id = c.id AND i.anime_id = $2 AND i.source = $3
     )`,
    [userId, animeId, source],
  );
  return rows;
}
