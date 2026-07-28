import type { Metadata } from "next";
import ProfilePageClient from "./page-client";

export const metadata: Metadata = {
  title: "Your Anime Profile & Watch Stats",
  description: "View your anime profile, track your watching progress, manage your list, and see your stats.",
};

export default function ProfilePage() {
  return <ProfilePageClient />;
}
