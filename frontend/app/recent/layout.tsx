import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Latest Episode Releases",
  description:
    "Browse the newest anime episodes as they're released, updated continuously.",
  openGraph: {
    title: "Latest Episode Releases | Anibinge",
    description: "Browse the newest anime episodes as they're released.",
  },
};

export default function RecentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
