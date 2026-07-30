import { NextResponse } from "next/server";
import { fetchHtml, parseHomepageAuto } from "../_animexin";

export async function GET() {
  try {
    const html = await fetchHtml("/");
    const { popular } = parseHomepageAuto(html);
    return NextResponse.json({ data: popular });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
