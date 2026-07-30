import type { Metadata } from "next/types";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ManhwaPageClient from "./manhwa-page-client";

export const metadata: Metadata = {
  title: "Manhwa — Korean Comics",
  description: "Browse and read manhwa online free. Discover trending Korean webtoons and comics with English translations.",
  openGraph: {
    title: "Manhwa — Korean Comics | Anibinge",
    description: "Browse and read manhwa online free. Discover trending Korean webtoons and comics with English translations.",
  },
};

export default function ManhwaPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    }>
      <ManhwaPageClient />
    </Suspense>
  );
}
