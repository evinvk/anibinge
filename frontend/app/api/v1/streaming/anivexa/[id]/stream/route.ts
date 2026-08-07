import { NextResponse } from "next/server";
import { getAnivexaStream } from "@/lib/anivexa";

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idIdx = segments.indexOf("anivexa") + 1;
  const anilistId = parseInt(segments[idIdx]);
  const ep = parseInt(url.searchParams.get("ep") || "1");
  const audio = url.searchParams.get("audio") || "sub";

  if (isNaN(anilistId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const stream = await getAnivexaStream(anilistId, ep, audio);
    if (!stream)
      return NextResponse.json({ error: "No stream found" }, { status: 404 });
    return NextResponse.json(stream, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=21600" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
