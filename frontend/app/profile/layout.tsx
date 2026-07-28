import type { Metadata } from "next";

// Account pages have no unique public content — keep them out of the
// search index, but still let crawlers follow links from them.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
