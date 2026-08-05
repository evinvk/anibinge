import { NextRequest, NextResponse } from "next/server";
import { getCollection, deleteCollection } from "@/lib/collections-store";
import { getUserId } from "@/lib/auth-route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ detail: "Collection not found" }, { status: 404 });
    return NextResponse.json(collection, { headers: { "Cache-Control": "private, no-cache" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ detail: "Invalid token" }, { status: 401 });

  try {
    await deleteCollection(id, userId);
    return NextResponse.json({ deleted: true });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 404 });
  }
}
