"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Menu, X, Sparkles, User, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchModal } from "@/components/search-modal";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/notification-bell";

const LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/schedule", label: "Schedule" },
  { href: "/news", label: "News" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="h-5 w-5 text-primary-400" />
          <span className="text-gradient">Anibinge</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-mist transition-colors hover:text-paper">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
            className="rounded-full p-2 text-mist transition-colors hover:bg-white/5 hover:text-paper"
          >
            <Search className="h-5 w-5" />
          </button>
          <NotificationBell />
          <Link
            href="/watchlist"
            className="flex items-center gap-2 rounded-full bg-primary-600 px-2.5 py-2 text-sm font-medium text-white shadow-glow-sm transition-transform hover:scale-105 sm:px-4"
            aria-label="My Watchlist"
          >
            <Bookmark className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">My Watchlist</span>
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
                  className="rounded-full border border-white/10 px-3 py-2 text-sm text-mist transition-colors hover:text-paper sm:px-4"
                >
                  Sign in
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

      <div className={cn("overflow-hidden transition-all duration-300 md:hidden", open ? "max-h-64" : "max-h-0")}>
        <div className="flex flex-col gap-1 px-4 pb-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
              {l.label}
            </Link>
          ))}
          <Link href="/watchlist" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-primary-400 hover:bg-white/5">
            My Watchlist
          </Link>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-sm text-mist">Notifications</span>
            <NotificationBell />
          </div>
          {!loading && (
            user ? (
              <Link href="/profile" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
                Profile ({user.username})
              </Link>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-mist hover:bg-white/5 hover:text-paper">
                Sign in
              </Link>
            )
          )}
        </div>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
