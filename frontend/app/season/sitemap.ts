import type { MetadataRoute } from "next";
import { SITE_URL, SEASON_PAGES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return SEASON_PAGES.map((s) => ({
    url: `${SITE_URL}/season/${s.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));
}
