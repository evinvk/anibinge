import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const MANHWA_TOTAL_PAGES = 373;

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/manhwa`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
  for (let p = 2; p <= MANHWA_TOTAL_PAGES; p++) {
    routes.push({
      url: `${SITE_URL}/manhwa?page=${p}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  return routes;
}
