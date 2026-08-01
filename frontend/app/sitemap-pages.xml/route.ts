import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

const PAGES = [
  { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
  { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/search`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/seasonal`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/schedule`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/discover`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.7 },
  { url: `${SITE_URL}/recent`, changeFrequency: "hourly", priority: 0.9 },
  { url: `${SITE_URL}/studios`, changeFrequency: "weekly", priority: 0.6 },
  { url: `${SITE_URL}/donghua`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/manhwa`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.3 },
  { url: `${SITE_URL}/profile`, changeFrequency: "monthly", priority: 0.2 },
  { url: `${SITE_URL}/watchlist`, changeFrequency: "monthly", priority: 0.2 },
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const dynamic = "force-static";

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url>\n    <loc>${esc(p.url)}</loc>\n    <changefreq>${p.changeFrequency}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`).join("\n")}
</urlset>`;
  return new NextResponse(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
