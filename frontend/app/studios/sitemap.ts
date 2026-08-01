import type { MetadataRoute } from "next";
import { SITE_URL, STUDIO_PAGES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return STUDIO_PAGES.map((s) => ({
    url: `${SITE_URL}/studios/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}
