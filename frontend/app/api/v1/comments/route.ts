import { NextRequest, NextResponse } from "next/server";
import { getComments, createComment } from "@/lib/comments-store";

function decodeToken(token: string): { sub?: string; username?: string; exp?: number } {
  try {
    const payload = token.split(".")[1];
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    return parsed;
  } catch {
    return {};
  }
}

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const payload = decodeToken(token);
  return payload?.sub || null;
}

function getUserName(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const payload = decodeToken(token);
  return payload?.username || null;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const episodeNumber = parseInt(req.nextUrl.searchParams.get("episode_number") || "1");
  const sort = req.nextUrl.searchParams.get("sort") || "newest";

  if (!slug) return NextResponse.json({ comments: [], total: 0 });

  try {
    const result = await getComments(slug, episodeNumber, sort);

    // Attach replies to each top-level comment
    for (const comment of result.comments) {
      const { getReplies } = await import("@/lib/comments-store");
      comment.replies = await getReplies(slug, episodeNumber, comment.id);
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-cache", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slug || body.episode_number === undefined || body.episode_number === null || !body.body) {
    return NextResponse.json({ detail: "Missing required fields: slug, episode_number, body" }, { status: 400 });
  }

  try {
    const username = getUserName(req) || "User-" + userId.slice(0, 6);
    const comment = await createComment(userId, username, body);
    return NextResponse.json(comment, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 400 });
  }
}
