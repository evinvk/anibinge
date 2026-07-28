import type { Metadata } from "next";
import LoginPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Sign In — Track Your Anime",
  description: "Sign in to Anibinge to track your watchlist, rate anime, and never miss an episode.",
};

export default function LoginPage() {
  return <LoginPageClient />;
}
