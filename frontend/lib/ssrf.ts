import { NextResponse } from "next/server";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "instance-data.internal",
]);

const BLOCKED_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::ffff:127\.|::ffff:10\.|::ffff:172\.(1[6-9]|2\d|3[01])\.|::ffff:192\.168\.|fe80:|fc00:|fd00:)/;

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export function isUrlAllowed(urlStr: string): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, error: "Only http/https allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    return { ok: false, error: "Blocked host" };
  }

  if (BLOCKED_IP_RE.test(hostname)) {
    return { ok: false, error: "Blocked IP range" };
  }

  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, error: "Blocked TLD" };
  }

  return { ok: true };
}

export function ssrfBlock(url: string): NextResponse | null {
  const check = isUrlAllowed(url);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 403 });
  }
  return null;
}
