import { NextResponse } from "next/server";
import { fetchHtml, parseHomepage } from "../_animexin";

export async function GET() {
  try {
    const html = await fetchHtml("/");
    const { popular } = parseHomepage(html);
    return NextResponse.json({ data: popular });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
