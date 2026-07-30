import { randomBytes, scryptSync, createHmac } from "crypto";
import fs from "fs";
import path from "path";

const SECRET = process.env.AUTH_SECRET || "anibinge-dev-secret-key-change-in-production";
const PEPPER = process.env.AUTH_PEPPER || "anibinge-dev-pepper";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

interface StoredUser {
  id: string;
  email: string;
  username: string;
  hash: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

function usersFilePath(): string {
  try {
    const dir = process.cwd();
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      return path.join(dir, ".auth-users.json");
    } catch {
      return "/tmp/.auth-users.json";
    }
  } catch {
    return "/tmp/.auth-users.json";
  }
}

function loadUsers(): Map<string, StoredUser> {
  const map = new Map<string, StoredUser>();
  try {
    const file = usersFilePath();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      for (const item of raw) map.set(item.email, item);
    }
  } catch {}
  // Always sync admin from env vars (overwrites file version)
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const existing = map.get(ADMIN_EMAIL);
    map.set(ADMIN_EMAIL, {
      id: existing?.id || randomBytes(12).toString("hex"),
      email: ADMIN_EMAIL,
      username: existing?.username || ADMIN_EMAIL.split("@")[0],
      hash: hashPassword(ADMIN_PASSWORD),
      avatar_url: existing?.avatar_url || null,
      is_admin: true,
      created_at: existing?.created_at || new Date().toISOString(),
    });
  }
  return map;
}

function saveUsers(users: Map<string, StoredUser>): void {
  try {
    const file = usersFilePath();
    fs.writeFileSync(file, JSON.stringify(Array.from(users.values())), "utf-8");
  } catch {}
}

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

export function registerUser(email: string, username: string, password: string): { access_token: string; token_type: string } {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();
  if (users.has(normalizedEmail)) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  if (users.size >= 1000) {
    throw Object.assign(new Error("Registration limit reached"), { status: 503 });
  }
  const id = randomBytes(12).toString("hex");
  const isAdmin = users.size === 0;
  const user: StoredUser = {
    id,
    email: normalizedEmail,
    username: username.trim(),
    hash: hashPassword(password),
    avatar_url: null,
    is_admin: isAdmin,
    created_at: new Date().toISOString(),
  };
  users.set(normalizedEmail, user);
  saveUsers(users);
  return { access_token: generateToken({ id, email: normalizedEmail, username: username.trim(), is_admin: isAdmin }), token_type: "bearer" };
}

export function loginUser(email: string, password: string): { access_token: string; token_type: string } {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();
  const user = users.get(normalizedEmail);
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

export function getUserCount(): number {
  return loadUsers().size;
}

export function listUsers(q: string, page: number, perPage: number): { users: any[]; total: number } {
  const users = loadUsers();
  const all = Array.from(users.values());
  const filtered = q
    ? all.filter((u) => u.email.includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()))
    : all;
  const sorted = filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const start = (page - 1) * perPage;
  const pageItems = sorted.slice(start, start + perPage);
  return {
    users: pageItems.map((u) => ({
      id: u.id, email: u.email, username: u.username,
      avatar_url: u.avatar_url, is_admin: u.is_admin, created_at: u.created_at,
      has_google: false,
    })),
    total: filtered.length,
  };
}

export function deleteUser(targetId: string, adminId: string): { detail: string } {
  if (targetId === adminId) {
    throw Object.assign(new Error("Cannot delete your own account"), { status: 400 });
  }
  const users = loadUsers();
  let target: StoredUser | undefined;
  for (const u of users.values()) {
    if (u.id === targetId) { target = u; break; }
  }
  if (!target) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  users.delete(target.email);
  saveUsers(users);
  return { detail: `User ${target.email} deleted` };
}

export function setAdmin(targetId: string, isAdmin: boolean, adminId: string): any {
  const users = loadUsers();
  let target: StoredUser | undefined;
  for (const u of users.values()) {
    if (u.id === targetId) { target = u; break; }
  }
  if (!target) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  if (targetId === adminId && !isAdmin) {
    throw Object.assign(new Error("Cannot remove your own admin privileges"), { status: 400 });
  }
  target.is_admin = isAdmin;
  saveUsers(users);
  return { id: target.id, email: target.email, username: target.username, avatar_url: target.avatar_url, is_admin: target.is_admin, created_at: target.created_at, has_google: false };
}

const watchlists = new Map<string, Map<number, any>>();

export interface WatchlistEntry {
  anime_id: number;
  source: string;
  status: string;
  progress: number;
  rating: number | null;
  updated_at: string;
}

export function getWatchlist(userId: string): WatchlistEntry[] {
  const list = watchlists.get(userId);
  return list ? Array.from(list.values()) : [];
}

export function upsertWatchlistEntry(userId: string, entry: { anime_id: number; source?: string; status: string; progress?: number; rating?: number | null }): WatchlistEntry {
  if (!watchlists.has(userId)) watchlists.set(userId, new Map());
  const list = watchlists.get(userId)!;
  const existing = list.get(entry.anime_id);
  const updated: WatchlistEntry = {
    anime_id: entry.anime_id,
    source: entry.source || existing?.source || "mal",
    status: entry.status,
    progress: entry.progress ?? existing?.progress ?? 0,
    rating: entry.rating !== undefined ? entry.rating : (existing?.rating ?? null),
    updated_at: new Date().toISOString(),
  };
  list.set(entry.anime_id, updated);
  return updated;
}

export function removeWatchlistEntry(userId: string, animeId: number): { removed: number } {
  const list = watchlists.get(userId);
  if (list) list.delete(animeId);
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
