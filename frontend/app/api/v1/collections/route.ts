import { NextRequest, NextResponse } from "next/server";
import { listCollections, createCollection } from "@/lib/collections-store";
import { requireUser } from "@/lib/auth-route";

export async function GET(req: NextRequest) {
  const auth = requireUser(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const collections = await listCollections(auth.userId);
    return NextResponse.json({ collections });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if (auth instanceof NextResponse) return auth;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  try {
    const collection = await createCollection(auth.userId, body.name, body.description || null);
    return NextResponse.json(collection, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 400 });
  }
}
