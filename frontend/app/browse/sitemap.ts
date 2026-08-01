import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const CATALOG_TOTAL_PAGES = 297;

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/browse`,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
  for (let p = 2; p <= CATALOG_TOTAL_PAGES; p++) {
    routes.push({
      url: `${SITE_URL}/browse?page=${p}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  return routes;
}
