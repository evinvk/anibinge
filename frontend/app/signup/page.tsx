import type { Metadata } from "next";
import SignupPageClient from "./page-client";

export const metadata: Metadata = {
  title: "Create Your Free Anime Account",
  description: "Sign up for free to start tracking anime, building your watchlist, and discovering new series.",
};

export default function SignupPage() {
  return <SignupPageClient />;
}
