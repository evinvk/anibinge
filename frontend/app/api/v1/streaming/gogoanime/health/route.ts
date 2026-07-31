import { NextResponse } from "next/server";
import { fetchGogoApi } from "../_gogoanime";

export async function GET() {
  try {
    const data = await fetchGogoApi("/api/search?keyword=&page=1", 30000);
    const items = Array.isArray(data) ? data : data.items || [];
    return NextResponse.json({ healthy: items.length > 0 });
  } catch (e: any) {
    return NextResponse.json({ healthy: false, reason: e.message });
  }
}
