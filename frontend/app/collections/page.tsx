import type { Metadata } from "next";
import CollectionsPageClient from "./page-client";

export const metadata: Metadata = {
  title: "My Anime Collections",
  description: "Create and manage your anime collections. Organize your favorite anime into custom lists.",
};

export default function CollectionsPage() {
  return <CollectionsPageClient />;
}
