"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, X, Sparkles, User, Bookmark, LogIn, ChevronDown, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { RandomAnimeButton } from "@/components/random-anime-button";

const LINKS = [
  { href: "/", label: "Anime" },
  { href: "/donghua", label: "Donghua" },
  { href: "/manhwa", label: "Manhwa" },
  { href: "/hindi-anime", label: "Hindi Dubs" },
];

const BROWSE_LINKS = [
  { href: "/browse", label: "Browse All" },
  { href: "/movies", label: "Movies" },
  { href: "/ova", label: "OVA" },
  { href: "/ona", label: "ONA" },
  { href: "/specials", label: "Specials" },
  { href: "/az", label: "A–Z Index" },
  { href: "/schedule", label: "Schedule" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/news", label: "News" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const browseRef = useRef<HTMLDivElement>(null);
  const { user, loading } = useAuth();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(e.target as Node)) setBrowseOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="h-5 w-5 text-primary-400" />
          <span className="text-gradient">Anibinge</span>
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-mist transition-colors hover:text-paper">
              {l.label}
            </Link>
          ))}
          <div className="relative" ref={browseRef}>
            <button
              onClick={() => setBrowseOpen((v) => !v)}
              className="flex items-center gap-1 text-sm text-mist transition-colors hover:text-paper"
            >
              Browse
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", browseOpen && "rotate-180")} />
            </button>
            {browseOpen && (
              <div className="absolute left-1/2 top-full mt-3 w-44 -translate-x-1/2 rounded-xl border border-white/10 bg-surface-hi/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-md animate-[fadeIn_0.15s_ease-out]">
                {BROWSE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setBrowseOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-mist transition hover:bg-white/5 hover:text-paper"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <RandomAnimeButton className="hidden md:flex" />
          <Link
            href="/watchlist"
            className="flex items-center gap-2 rounded-full bg-primary-600 px-2.5 py-2 text-sm font-medium text-white shadow-glow-sm transition-transform hover:scale-105 sm:px-4"
            aria-label="My Watchlist"
          >
            <Bookmark className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">My Watchlist</span>
          </Link>
          <Link
            href="/collections"
            className="flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-2 text-sm text-mist transition-colors hover:text-paper sm:px-4"
            aria-label="My Collections"
          >
            <FolderPlus className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Collections</span>
          </Link>
          {!loading && (
            <>
              {user ? (
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-full border border-white/10 px-2 py-1.5 text-sm text-mist transition-colors hover:text-paper sm:px-3"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  aria-label="Sign in"
                  className="rounded-full border border-white/10 p-2.5 text-mist transition-colors hover:text-paper"
                >
                  <LogIn className="h-4 w-4" />
                </Link>
              )}
            </>
          )}
          <button
            aria-label="Toggle menu"
            className="p-2 md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <div className={cn("overflow-hidden transition-all duration-300 md:hidden", open ? "max-h-[100dvh]" : "max-h-0")}>
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto px-4 pb-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
              {l.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-white/5 pt-1">
            {BROWSE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <RandomAnimeButton />
          </div>
          <Link href="/watchlist" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-primary-400 hover:bg-white/5">
            My Watchlist
          </Link>
          <Link href="/collections" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
            Collections
          </Link>
          {!loading && (
            user ? (
              <Link href="/profile" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
                Profile ({user.username})
              </Link>
            ) : (
              <Link
                href="/login"
                aria-label="Sign in"
                onClick={() => setOpen(false)}
                className="inline-flex w-fit rounded-full border border-white/10 p-2.5 text-mist hover:text-paper"
              >
                <LogIn className="h-4 w-4" />
              </Link>
            )
          )}
        </div>
      </div>

    </header>
  );
}
