import Image from "next/image";
import { Play } from "lucide-react";

export const metadata = { title: "Anime News" };

// TODO: back this with a real feed. Options: (1) a lightweight scraper-free
// RSS aggregator over official studio/publisher feeds, (2) a `news_items`
// table populated by an admin/editorial workflow, or (3) a licensed news API.
// Shown here with a fixed shape so the frontend contract is stable either way.
interface NewsItem {
  id: string;
  title: string;
  category: "news" | "industry" | "trailer" | "announcement";
  image: string;
  summary: string;
  publishedAt: string;
}

const PLACEHOLDER_ITEMS: NewsItem[] = [];

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">News</h1>
      <p className="mt-1 text-mist">Anime news, industry updates, trailers, and announcements.</p>

      {PLACEHOLDER_ITEMS.length === 0 ? (
        <div className="mt-16 rounded-xl2 glass-card p-10 text-center">
          <Play className="mx-auto h-8 w-8 text-primary-400" />
          <p className="mt-4 text-mist">
            No news source is connected yet. Wire up{" "}
            <code className="rounded bg-surface-hi px-1.5 py-0.5 text-xs">GET /api/v1/news</code>{" "}
            on the backend once a feed is chosen, and this grid renders automatically.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PLACEHOLDER_ITEMS.map((item) => (
            <article key={item.id} className="glass-card overflow-hidden">
              <div className="relative aspect-video">
                <Image src={item.image} alt={item.title} fill className="object-cover" />
              </div>
              <div className="p-4">
                <span className="text-xs uppercase tracking-wide text-primary-400">{item.category}</span>
                <h3 className="mt-1 font-display font-semibold">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-mist">{item.summary}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
