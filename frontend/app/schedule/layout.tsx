import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anime Airing Schedule",
  description:
    "See what anime is airing today and this week, organized by broadcast day, plus upcoming releases.",
  openGraph: {
    title: "Anime Airing Schedule | Anibinge",
    description: "See what anime is airing today and this week, organized by broadcast day.",
  },
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
