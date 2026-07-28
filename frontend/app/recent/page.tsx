import type { Metadata } from "next";
import RecentPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Recently Released Anime Episodes",
  description: "See the latest anime episode releases. Stream newly aired episodes from ongoing series in HD.",
};

export default function RecentPage() {
  return <RecentPageClient />;
}
