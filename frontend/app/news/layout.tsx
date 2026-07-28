import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anime News",
  description:
    "The latest anime news, announcements, and industry updates in one place.",
  openGraph: {
    title: "Anime News | Anibinge",
    description: "The latest anime news, announcements, and industry updates.",
  },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
