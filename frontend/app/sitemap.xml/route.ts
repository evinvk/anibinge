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

export async function GET() {
  const now = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAPS.map((url) => `  <sitemap>\n    <loc>${esc(url)}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`).join("\n")}
</sitemapindex>`;
  return new NextResponse(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
