import Link from "next/link";

const now = new Date();
const m = now.getMonth() + 1;
const year = now.getFullYear();
const currentSeason = m <= 2 || m === 12 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
const currentSeasonLabel = `${currentSeason.charAt(0).toUpperCase()}${currentSeason.slice(1)} ${year}`;

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 bg-surface/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Explore</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/browse">Browse</Link></li>
            <li><Link href="/seasonal">Seasonal</Link></li>
            <li><Link href={`/season/${currentSeason}-${year}`}>{currentSeasonLabel}</Link></li>
            <li><Link href="/schedule">Schedule</Link></li>
            <li><Link href="/studios">Studios</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold text-paper">Discover</h4>
          <ul className="mt-3 space-y-2 text-sm text-mist">
            <li><Link href="/news">News</Link></li>
            <li><Link href="/search">Search</Link></li>
            <li><Link href="/recent">Latest Releases</Link></li>
            <li><Link href="/hindi-anime">Hindi Dubbed Anime</Link></li>
            <li><Link href="/genres/action">Action</Link></li>
            <li><Link href="/genres/romance">Romance</Link></li>
            <li><Link href="/genres/fantasy">Fantasy</Link></li>
            <li><Link href="/genres/sci-fi">Sci-Fi</Link></li>
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
