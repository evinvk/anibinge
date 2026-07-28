import type { Metadata } from "next";
import NewsPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Latest Anime News & Updates",
  description: "Stay up to date with the latest anime news, industry updates, trailer releases, and announcements.",
};

export default function NewsPage() {
  return <NewsPageClient />;
}
