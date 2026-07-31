import { NextResponse } from "next/server";
import { getHindiStream } from "@/lib/hindi";

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const anilistId = parseInt(url.searchParams.get("anilist_id") || "");
  const ep = parseInt(url.searchParams.get("ep") || "1");

  if (!anilistId || isNaN(anilistId)) {
    return NextResponse.json({ error: "Invalid anilist_id" }, { status: 400 });
  }
  if (!ep || ep < 1) {
    return NextResponse.json({ error: "Invalid ep" }, { status: 400 });
  }

  try {
    const stream = await getHindiStream(anilistId, ep);
    if (!stream) {
      return NextResponse.json({ error: "Hindi stream not available for this episode" }, { status: 404 });
    }
    return NextResponse.json(stream);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Hindi stream unavailable" }, { status: 503 });
  }
}
