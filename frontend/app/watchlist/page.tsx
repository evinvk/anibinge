import type { Metadata } from "next";
import WatchlistPageClient from "./page-client";

export const metadata: Metadata = {
  title: "My Anime Watchlist & Progress Tracker",
  description: "Manage your anime watchlist. Track what you're watching, plan to watch, completed, and more.",
};

export default function WatchlistPage() {
  return <WatchlistPageClient />;
}
