import { randomBytes, scryptSync, createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET || "anibinge-dev-secret-key-change-in-production";
const PEPPER = process.env.AUTH_PEPPER || "anibinge-dev-pepper";

// Bootstrap admin from env vars (survives deployments via Vercel env)
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

const users = new Map<string, StoredUser>();

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

function generateToken(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  if (signature !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.sub !== "string") return null;
    return data.sub;
  } catch {
    return null;
  }
}

// Bootstrap admin on startup if env vars are set
function bootstrapAdmin(): void {
  if (ADMIN_EMAIL && ADMIN_PASSWORD && !users.has(ADMIN_EMAIL)) {
    const id = randomBytes(12).toString("hex");
    const user: StoredUser = {
      id,
      email: ADMIN_EMAIL,
      username: ADMIN_EMAIL.split("@")[0],
      hash: hashPassword(ADMIN_PASSWORD),
      avatar_url: null,
      is_admin: true,
      created_at: new Date().toISOString(),
    };
    users.set(ADMIN_EMAIL, user);
  }
}
bootstrapAdmin();

export function registerUser(email: string, username: string, password: string): { access_token: string; token_type: string } {
  const normalizedEmail = email.toLowerCase().trim();
  if (users.has(normalizedEmail)) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  if (users.size >= 1000) {
    throw Object.assign(new Error("Registration limit reached"), { status: 503 });
  }
  const id = randomBytes(12).toString("hex");
  const isAdmin = users.size === 0; // first registered user becomes admin
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
  return { access_token: generateToken(id), token_type: "bearer" };
}

export function loginUser(email: string, password: string): { access_token: string; token_type: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const user = users.get(normalizedEmail);
  if (!user || !verifyPassword(password, user.hash)) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  return { access_token: generateToken(user.id), token_type: "bearer" };
}

function getUserById(id: string): StoredUser | undefined {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return undefined;
}

function userToPublic(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatar_url: user.avatar_url,
    is_admin: user.is_admin,
    created_at: user.created_at,
  };
}

// Admin helper: verify token and check admin status from the request
export function getCurrentAdminUser(req: { headers: { get: (name: string) => string | null } }): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user || !user.is_admin) return null;
  return userId;
}

export function getUserCount(): number {
  return users.size;
}

// Admin: list users with search and pagination
export function listUsers(q: string, page: number, perPage: number): { users: any[]; total: number } {
  const all = Array.from(users.values());
  const filtered = q
    ? all.filter((u) => u.email.includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()))
    : all;
  const sorted = filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const start = (page - 1) * perPage;
  const pageItems = sorted.slice(start, start + perPage);
  return {
    users: pageItems.map((u) => ({ ...userToPublic(u), has_google: false })),
    total: filtered.length,
  };
}

// Admin: delete a user (cannot delete yourself)
export function deleteUser(targetId: string, adminId: string): { detail: string } {
  if (targetId === adminId) {
    throw Object.assign(new Error("Cannot delete your own account"), { status: 400 });
  }
  const target = getUserById(targetId);
  if (!target) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  users.delete(target.email);
  return { detail: `User ${target.email} deleted` };
}

// Admin: set/unset admin (cannot demote yourself)
export function setAdmin(targetId: string, isAdmin: boolean, adminId: string): any {
  if (targetId === adminId && !isAdmin) {
    throw Object.assign(new Error("Cannot remove your own admin privileges"), { status: 400 });
  }
  const target = getUserById(targetId);
  if (!target) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  target.is_admin = isAdmin;
  return { ...userToPublic(target), has_google: false };
}

export function getUserFromToken(token: string): {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string | null;
} | null {
  const userId = verifyToken(token);
  if (!userId) return null;
  for (const user of users.values()) {
    if (user.id === userId) {
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url,
        is_admin: user.is_admin,
        created_at: user.created_at,
      };
    }
  }
  return null;
}
