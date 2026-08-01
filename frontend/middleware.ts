import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAnimeSlug } from "./lib/resolve-anime-slug";

const MAINTENANCE_VAR = "MAINTENANCE_MODE";
const BYPASS_PARAM = "maintenance_bypass";
const BYPASS_SECRET_VAR = "MAINTENANCE_BYPASS_SECRET";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isMaintenance =
    process.env[MAINTENANCE_VAR] === "true" ||
    process.env[MAINTENANCE_VAR] === "1";

  if (isMaintenance) {
    const bypassSecret = request.nextUrl.searchParams.get(BYPASS_PARAM);
    const expectedSecret = process.env[BYPASS_SECRET_VAR];
    if (bypassSecret && expectedSecret && bypassSecret === expectedSecret) {
      return NextResponse.next();
    }

    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/maintenance") ||
      pathname.startsWith("/favicon") ||
      pathname === "/icon.svg" ||
      pathname === "/robots.txt" ||
      pathname.startsWith("/sitemap")
    ) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    return NextResponse.rewrite(url);
  }

  if (pathname.startsWith("/anime/")) {
    const segment = pathname.slice("/anime/".length);
    if (segment && !/^\d+$/.test(segment)) {
      const resolution = await resolveAnimeSlug(segment);
      if (!resolution) {
        return NextResponse.next();
      }

      const url = request.nextUrl.clone();
      url.pathname = `/anime/${resolution.id}`;
      if (resolution.source === "anilist") {
        url.searchParams.set("source", "anilist");
      } else {
        url.searchParams.delete("source");
      }
      return NextResponse.redirect(url, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
