import type { MetadataRoute } from "next";
import { api } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://anibinge.fun";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/seasonal`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/schedule`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/recent`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/profile`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/watchlist`, changeFrequency: "monthly", priority: 0.2 },
  ];

  try {
    const { data } = await api.trending(1);
    const animeRoutes: MetadataRoute.Sitemap = data.map((a) => ({
      url: `${SITE_URL}/anime/${a.id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
    return [...staticRoutes, ...animeRoutes];
  } catch {
    return staticRoutes;
  }
}
