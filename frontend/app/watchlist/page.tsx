"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, WatchlistEntryData, AnimeSummary } from "@/lib/api";

const TABS = ["watching", "planning", "completed", "dropped", "favorites"] as const;

export default function WatchlistPage() {
  const { token, loading: authLoading, login, register, logout } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("watching");

  if (authLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-mist">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">My Watchlist</h1>
          <p className="mt-1 text-mist">Sign in to sync your list across devices.</p>
        </div>
        {token && (
          <button
            onClick={logout}
            className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-mist hover:text-paper"
          >
            Sign out
          </button>
        )}
      </div>

      {!token ? (
        <AuthForms onLogin={login} onRegister={register} />
      ) : (
        <>
          <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface-hi p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm capitalize transition-colors",
                  tab === t ? "bg-primary-600 text-white" : "text-mist hover:text-paper"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <WatchlistTab token={token} status={tab} />
        </>
      )}
    </div>
  );
}

function AuthForms({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, username, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <div className="mb-6 flex gap-1 rounded-full bg-surface-hi p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-sm capitalize transition-colors",
              mode === m ? "bg-primary-600 text-white" : "text-mist hover:text-paper"
            )}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-surface-hi px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-primary-500"
        />
        {mode === "register" && (
          <input
            type="text"
            required
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-surface-hi px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-primary-500"
          />
        )}
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-surface-hi px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-primary-500"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary-600 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function WatchlistTab({ token, status }: { token: string; status: string }) {
  const [entries, setEntries] = useState<WatchlistEntryData[] | null>(null);
  const [animeById, setAnimeById] = useState<Record<string, AnimeSummary | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getWatchlist(token)
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load your watchlist.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filtered = (entries ?? []).filter((e) => e.status === status);

  useEffect(() => {
    filtered.forEach((entry) => {
      const key = `${entry.source}:${entry.anime_id}`;
      if (key in animeById) return;
      api
        .detail(entry.anime_id, entry.source)
        .then((res) => setAnimeById((prev) => ({ ...prev, [key]: res.data })))
        .catch(() => setAnimeById((prev) => ({ ...prev, [key]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, status]);

  const removeEntry = async (animeId: number) => {
    setEntries((prev) => (prev ? prev.filter((e) => e.anime_id !== animeId) : prev));
    try {
      await api.removeWatchlistEntry(token, animeId);
    } catch {
      // best-effort UI removal; a stale entry will reappear on next reload if this failed
    }
  };

  if (error) {
    return <div className="mt-16 text-center text-mist">{error}</div>;
  }

  if (entries === null) {
    return <div className="mt-16 text-center text-mist">Loading your list…</div>;
  }

  if (filtered.length === 0) {
    return (
      <div className="mt-16 text-center text-mist">
        Your {status} list is empty. Browse anime and tap "Add to Watchlist" to get started.
      </div>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {filtered.map((entry) => {
        const key = `${entry.source}:${entry.anime_id}`;
        const anime = animeById[key];
        const href =
          entry.source === "anilist" ? `/anime/${entry.anime_id}?source=anilist` : `/anime/${entry.anime_id}`;

        return (
          <div key={key} className="group relative overflow-hidden rounded-xl bg-surface-hi">
            <Link href={href}>
              <div className="relative aspect-[2/3] w-full bg-surface">
                {anime?.image && (
                  <Image
                    src={anime.image}
                    alt={anime.title ?? "Anime poster"}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-sm font-medium text-paper">
                  {anime?.title_english || anime?.title || (anime === undefined ? "Loading…" : "Unavailable")}
                </p>
              </div>
            </Link>
            <button
              onClick={() => removeEntry(entry.anime_id)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              Remove
            </button>
          </div>
        );
      })}
    </div>
  );
}
