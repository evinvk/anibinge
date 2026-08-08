import type { MetadataRoute } from "next";
import { buildSitemapUrls } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

export default async function sitemap3(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapUrls();
}
