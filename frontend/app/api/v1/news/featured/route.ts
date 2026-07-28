import { NextResponse } from "next/server";
import { getFeatured } from "../_ann";

export async function GET() {
  try {
    const data = await getFeatured();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
