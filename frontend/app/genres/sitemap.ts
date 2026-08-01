import type { MetadataRoute } from "next";
import { GENRE_PAGES } from "@/lib/genre-seo";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return GENRE_PAGES.map((g) => ({
    url: `${SITE_URL}/genres/${g.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));
}
