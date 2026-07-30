import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET() {
  try {
    await fetchGogoApi("/api/home");
    return NextResponse.json({ healthy: true });
  } catch (e: any) {
    return NextResponse.json({ healthy: false, reason: e.message });
  }
}
