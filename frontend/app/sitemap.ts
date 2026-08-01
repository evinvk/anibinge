import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/sitemap-pages.xml`, lastModified: now },

    { url: `${SITE_URL}/anime/sitemap.xml`, lastModified: now },
    { url: `${SITE_URL}/watch/sitemap.xml`, lastModified: now },
    { url: `${SITE_URL}/genres/sitemap.xml`, lastModified: now },
    { url: `${SITE_URL}/season/sitemap.xml`, lastModified: now },
    { url: `${SITE_URL}/studios/sitemap.xml`, lastModified: now },
    { url: `${SITE_URL}/news/sitemap.xml`, lastModified: now },
  ];
}
