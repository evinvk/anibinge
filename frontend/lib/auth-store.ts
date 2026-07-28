import { randomBytes, scryptSync, createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET || "anibinge-dev-secret-key-change-in-production";
const PEPPER = process.env.AUTH_PEPPER || "anibinge-dev-pepper";

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

export function registerUser(email: string, username: string, password: string): { access_token: string; token_type: string } {
  const normalizedEmail = email.toLowerCase().trim();
  if (users.has(normalizedEmail)) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  if (users.size >= 1000) {
    throw Object.assign(new Error("Registration limit reached"), { status: 503 });
  }
  const id = randomBytes(12).toString("hex");
  const user: StoredUser = {
    id,
    email: normalizedEmail,
    username: username.trim(),
    hash: hashPassword(password),
    avatar_url: null,
    is_admin: false,
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
