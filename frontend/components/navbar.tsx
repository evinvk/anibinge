"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Sparkles, User, Bookmark, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "@/components/notification-bell";

const LINKS = [
  { href: "/", label: "Anime" },
  { href: "/donghua", label: "Donghua" },
  { href: "/manhwa", label: "Manhwa" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
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
