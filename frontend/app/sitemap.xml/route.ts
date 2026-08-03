import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

const SITEMAPS = [
  `${SITE_URL}/sitemap-pages.xml`,
  `${SITE_URL}/browse/sitemap.xml`,
  `${SITE_URL}/manhwa/sitemap.xml`,
  `${SITE_URL}/anime/sitemap.xml`,
  `${SITE_URL}/watch/sitemap.xml`,
  `${SITE_URL}/genres/sitemap.xml`,
  `${SITE_URL}/season/sitemap.xml`,
  `${SITE_URL}/studios/sitemap.xml`,
  `${SITE_URL}/news/sitemap.xml`,
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const dynamic = "force-static";

const LAST_MOD = "2026-08-03T00:00:00Z";

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAPS.map((url) => `  <sitemap>\n    <loc>${esc(url)}</loc>\n    <lastmod>${LAST_MOD}</lastmod>\n  </sitemap>`).join("\n")}
</sitemapindex>`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
