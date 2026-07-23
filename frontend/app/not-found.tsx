import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="glass-card max-w-md p-8">
        <h1 className="font-display text-6xl font-bold text-paper/20">404</h1>
        <h2 className="mt-2 font-display text-xl font-bold text-paper">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-mist">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href="/"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/80"
          >
            Go Home
          </Link>
          <Link
            href="/browse"
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-mist transition hover:bg-white/5"
          >
            Browse Anime
          </Link>
        </div>
      </div>
    </div>
  );
}
