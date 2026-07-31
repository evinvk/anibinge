import { randomBytes, scryptSync, createHmac } from "crypto";
import { query } from "./db";

const SECRET = process.env.AUTH_SECRET || "anibinge-dev-secret-key-change-in-production";
const PEPPER = process.env.AUTH_PEPPER || "anibinge-dev-pepper";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password + PEPPER, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derivedKey = scryptSync(password + PEPPER, salt, 64).toString("hex");
  return derivedKey === key;
}

function generateToken(user: { id: string; email: string; username: string; is_admin: boolean }): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    username: user.username,
    is_admin: user.is_admin,
    iat: Math.floor(Date.now() / 1000),
  })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function decodeToken(token: string): {
  sub: string; email: string; username: string; is_admin: boolean; iat: number;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.sub !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

async function syncAdminUser(): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  await query(
    `INSERT INTO users (id, email, username, hash, avatar_url, is_admin, created_at)
     VALUES ($1, $2, $3, $4, NULL, true, now())
     ON CONFLICT (email) DO UPDATE SET hash = EXCLUDED.hash, is_admin = true`,
    [randomBytes(12).toString("hex"), ADMIN_EMAIL, ADMIN_EMAIL.split("@")[0], hashPassword(ADMIN_PASSWORD)],
  );
}

export async function registerUser(email: string, username: string, password: string): Promise<{ access_token: string; token_type: string }> {
  await syncAdminUser();
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [normalizedEmail]);
  if (existing.length > 0) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  const count = await query(`SELECT count(*)::int AS c FROM users`);
  if (count[0].c >= 1000) {
    throw Object.assign(new Error("Registration limit reached"), { status: 503 });
  }
  const id = randomBytes(12).toString("hex");
  const isAdmin = count[0].c === 0;
  const cleanUsername = username.trim();
  await query(
    `INSERT INTO users (id, email, username, hash, avatar_url, is_admin, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5, now())`,
    [id, normalizedEmail, cleanUsername, hashPassword(password), isAdmin],
  );
  return { access_token: generateToken({ id, email: normalizedEmail, username: cleanUsername, is_admin: isAdmin }), token_type: "bearer" };
}

export async function loginUser(email: string, password: string): Promise<{ access_token: string; token_type: string }> {
  await syncAdminUser();
  const normalizedEmail = email.toLowerCase().trim();
  const rows = await query(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.hash)) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  return { access_token: generateToken({ id: user.id, email: user.email, username: user.username, is_admin: user.is_admin }), token_type: "bearer" };
}

export function getCurrentUser(req: { headers: { get: (name: string) => string | null } }): { id: string; email: string; username: string; is_admin: boolean } | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const tokenData = decodeToken(auth.slice(7));
  if (!tokenData) return null;
  return { id: tokenData.sub, email: tokenData.email, username: tokenData.username, is_admin: tokenData.is_admin };
}

export function getCurrentAdminUser(req: { headers: { get: (name: string) => string | null } }): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const tokenData = decodeToken(auth.slice(7));
  if (!tokenData || !tokenData.is_admin) return null;
  return tokenData.sub;
}

export async function getUserCount(): Promise<number> {
  await syncAdminUser();
  const rows = await query(`SELECT count(*)::int AS c FROM users`);
  return rows[0].c;
}

export async function listUsers(q: string, page: number, perPage: number): Promise<{ users: any[]; total: number }> {
  await syncAdminUser();
  const where = q ? `WHERE email ILIKE $1 OR username ILIKE $1` : "";
  const params = q ? [`%${q}%`] : [];
  const total = await query(`SELECT count(*)::int AS c FROM users ${where}`, params);
  const rows = await query(
    `SELECT id, email, username, avatar_url, is_admin, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, perPage, (page - 1) * perPage],
  );
  return {
    users: rows.map((u) => ({
      id: u.id, email: u.email, username: u.username,
      avatar_url: u.avatar_url, is_admin: u.is_admin, created_at: u.created_at,
      has_google: false,
    })),
    total: total[0].c,
  };
}

export async function deleteUser(targetId: string, adminId: string): Promise<{ detail: string }> {
  if (targetId === adminId) {
    throw Object.assign(new Error("Cannot delete your own account"), { status: 400 });
  }
  const target = await query(`SELECT email FROM users WHERE id = $1`, [targetId]);
  if (target.length === 0) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  await query(`DELETE FROM users WHERE id = $1`, [targetId]);
  return { detail: `User ${target[0].email} deleted` };
}

export async function setAdmin(targetId: string, isAdmin: boolean, adminId: string): Promise<any> {
  const target = await query(`SELECT id, email, username, avatar_url, is_admin, created_at FROM users WHERE id = $1`, [targetId]);
  if (target.length === 0) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  if (targetId === adminId && !isAdmin) {
    throw Object.assign(new Error("Cannot remove your own admin privileges"), { status: 400 });
  }
  await query(`UPDATE users SET is_admin = $1 WHERE id = $2`, [isAdmin, targetId]);
  return { ...target[0], is_admin: isAdmin, has_google: false };
}

export interface WatchlistEntry {
  anime_id: number;
  source: string;
  status: string;
  progress: number;
  rating: number | null;
  updated_at: string;
}

export async function getWatchlist(userId: string): Promise<WatchlistEntry[]> {
  const rows = await query(
    `SELECT anime_id, source, status, progress, rating, updated_at
     FROM watchlist WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows;
}

export async function upsertWatchlistEntry(userId: string, entry: { anime_id: number; source?: string; status: string; progress?: number; rating?: number | null }): Promise<WatchlistEntry> {
  const rows = await query(
    `INSERT INTO watchlist (user_id, anime_id, source, status, progress, rating, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id, anime_id)
     DO UPDATE SET source = EXCLUDED.source, status = EXCLUDED.status, progress = EXCLUDED.progress, rating = EXCLUDED.rating, updated_at = now()
     RETURNING anime_id, source, status, progress, rating, updated_at`,
    [userId, entry.anime_id, entry.source || "mal", entry.status, entry.progress ?? 0, entry.rating !== undefined ? entry.rating : null],
  );
  return rows[0];
}

export async function removeWatchlistEntry(userId: string, animeId: number): Promise<{ removed: number }> {
  await query(`DELETE FROM watchlist WHERE user_id = $1 AND anime_id = $2`, [userId, animeId]);
  return { removed: 1 };
}

export function getUserFromToken(token: string): {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string | null;
} | null {
  const data = decodeToken(token);
  if (!data) return null;
  return {
    id: data.sub,
    email: data.email,
    username: data.username,
    avatar_url: null,
    is_admin: data.is_admin,
    created_at: null,
  };
}
