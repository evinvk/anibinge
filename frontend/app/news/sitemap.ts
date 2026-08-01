import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.7 }];
}
