import type { Metadata } from "next";
import CollectionPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Collection",
  description: "Browse a custom anime collection.",
};

export default function CollectionPage() {
  return <CollectionPageClient />;
}
