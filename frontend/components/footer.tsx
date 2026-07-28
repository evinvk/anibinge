import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 bg-surface/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Explore</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/browse">Browse</Link></li>
            <li><Link href="/seasonal">Seasonal</Link></li>
            <li><Link href="/schedule">Schedule</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Discover</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/news">News</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Account</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/watchlist">Watchlist</Link></li>
            <li><Link href="/profile">Profile</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Anibinge</h4>
          <p className="mt-3 text-sm text-mist">
            Watch anime online free in HD. Stream sub &amp; dub episodes, track your watchlist, and never miss a new release.
          </p>
          <p className="mt-2 text-xs text-mist/60">
            Data via MyAnimeList (Jikan) &amp; AniList.
          </p>
        </div>
      </div>
      <p className="border-t border-white/10 px-6 py-4 text-center text-xs text-mist">
        © {new Date().getFullYear()} Built for the community.
      </p>
    </footer>
  );
}
