import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/seo";
import { fetchGogoApi } from "@/app/api/v1/streaming/gogoanime/_gogoanime";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  const addWatch = (slug: string, ep: number | null | undefined) => {
    if (!slug || !ep) return;
    const key = `${slug}:${ep}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({
      url: `${SITE_URL}/watch/${slug}?ep=${ep}`,
      changeFrequency: "daily",
      priority: 0.7,
    });
  };

  try {
    const recent = await api.recentEpisodes(1, 30);
    for (const item of recent.data || []) {
      addWatch(item.slug || "", item.episode);
    }
  } catch {}

  try {
    const latest = await api.gogoanimeLatest();
    for (const item of latest.data || []) {
      addWatch(item.slug || "", item.latest_episode || item.episodes_count);
    }
  } catch {}

  const pages = Array.from({ length: 20 }, (_, i) => i + 1);
  const results = await Promise.allSettled(
    pages.map((p) => fetchGogoApi(`/api/search?keyword=&page=${p}`, 30000))
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const data = r.value;
    const items = Array.isArray(data) ? data : data.items || [];
    for (const item of items) {
      addWatch(item.slug || "", item.latest_episode || item.episodes_count);
    }
  }

  return routes.slice(0, 1000);
}
