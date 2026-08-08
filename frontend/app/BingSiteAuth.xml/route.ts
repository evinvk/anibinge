import { NextResponse } from "next/server";

export const dynamic = "force-static";

const BING_AUTH_XML = `<?xml version="1.0"?>
<users>
	<user>A83C6C1CC993DC839606F24CAC5D5796</user>
</users>`;

export function GET() {
  return new NextResponse(BING_AUTH_XML, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
