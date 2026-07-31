import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AnimePageClient from "./anime-page-client";

export const metadata: Metadata = {
  title: "Anime — Watch Online Free",
  description:
    "Stream anime online free with English subtitles and dubs. Browse popular and currently airing series on Anibinge.",
  openGraph: {
    title: "Anime — Watch Online Free | Anibinge",
    description:
      "Stream anime online free with English subtitles and dubs. Browse popular and currently airing series.",
    type: "website",
  },
};

export default function AnimePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-void">
          <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
        </div>
      }
    >
      <AnimePageClient />
    </Suspense>
  );
}
