import type { Metadata } from "next/types";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ManhwaReaderClient from "./reader-client";

export const metadata: Metadata = {
  title: "Read Manhwa — Chapter Reader",
};

export default async function ManhwaReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ manga?: string }>;
}) {
  const { id } = await params;
  const { manga } = await searchParams;

  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    }>
      <ManhwaReaderClient chapterId={id} mangaId={manga || null} />
    </Suspense>
  );
}
