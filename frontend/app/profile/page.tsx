"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [token, loading, router]);

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-mist">Loading…</div>;
  }

  if (!token || !user) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Profile</h1>

      <div className="glass-card mt-6 flex items-center gap-4 p-6">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.username} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-700 font-display text-2xl font-bold text-white">
            {user.username[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">{user.username}</p>
          <p className="text-sm text-mist">{user.email}</p>
          <p className="mt-1 text-xs text-mist">
            Member since {new Date(user.created_at ?? Date.now()).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="glass-card mt-6 p-6">
        <h2 className="font-display font-semibold">Notifications</h2>
        <div className="mt-4 space-y-3 text-sm">
          {["New episode of a watching-list title airs", "Weekly seasonal digest", "Recommendation updates"].map((label) => (
            <label key={label} className="flex items-center justify-between">
              <span className="text-mist">{label}</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary-600" />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href="/watchlist"
          className="rounded-full bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          My Watchlist
        </Link>
        <button
          onClick={logout}
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-mist hover:text-paper"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
