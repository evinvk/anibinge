import type { Metadata } from "next";
import SchedulePageClient from "./page-client";

export const metadata: Metadata = {
  title: "Weekly Anime Schedule & Air Times",
  description: "Check the weekly anime schedule. See what's airing today and plan your watchlist for the week.",
};

export default function SchedulePage() {
  return <SchedulePageClient />;
}
