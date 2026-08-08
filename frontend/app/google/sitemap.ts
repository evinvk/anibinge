import type { MetadataRoute } from "next";
import { buildSitemapUrls } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapUrls();
}
