import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/seo";

async function collectAnimeIds(): Promise<string[]> {
  const ids = new Set<string>();
  const sources: Promise<{ data: any[] }>[] = [
    api.trending(1),
    api.airing(1),
    api.topRated(1),
    api.currentSeason(1),
  ];
  const results = await Promise.allSettled(sources);
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const a of r.value?.data || []) {
      if (a?.id) ids.add(String(a.id));
    }
  }
  return Array.from(ids);
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const ids = await collectAnimeIds();
    return ids.map((id) => ({
      url: `${SITE_URL}/anime/${id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}
