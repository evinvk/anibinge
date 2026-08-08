import type { MetadataRoute } from "next";
import { buildSitemapUrls } from "@/lib/sitemap-data";

export default async function sitemap2(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapUrls();
}
