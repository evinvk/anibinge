"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Users, Trash2, ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [busyPrefix, setBusyPrefix] = useState<string | null>(null);

  const isAdmin = user?.is_admin === true;

  useEffect(() => {
    const token = localStorage.getItem("anibinge_token");
    if (!token || !isAdmin) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_BASE}/api/v1/admin/analytics/overview`, { headers }).then((r) => r.json()).then(setOverview);
    fetch(`${API_BASE}/api/v1/admin/api-monitoring`, { headers }).then((r) => r.json()).then(setMonitoring);
  }, [isAdmin]);

  async function invalidateCache(prefix: string) {
    setBusyPrefix(prefix);
    const token = localStorage.getItem("anibinge_token");
    await fetch(`${API_BASE}/api/v1/admin/cache/invalidate/${prefix}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusyPrefix(null);
  }

  if (authLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-mist">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-mist" />
        <h1 className="mt-4 font-display text-2xl font-bold">Sign in required</h1>
        <p className="mt-2 text-mist">You must be logged in to access the admin dashboard.</p>
        <Link href="/login" className="mt-6 inline-block rounded-full bg-primary-600 px-6 py-2 text-sm font-medium hover:bg-primary-500">Log in</Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-center">
        <ShieldOff className="mx-auto h-12 w-12 text-mist" />
        <h1 className="mt-4 font-display text-2xl font-bold">Access denied</h1>
        <p className="mt-2 text-mist">You don't have admin privileges.</p>
      </div>
    );
  }

  async function invalidateCache(prefix: string) {
    setBusyPrefix(prefix);
    const token = localStorage.getItem("anibinge_token");
    await fetch(`${API_BASE}/api/v1/admin/cache/invalidate/${prefix}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusyPrefix(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total Users" value={overview?.total_users ?? "—"} />
        <StatCard icon={<Activity className="h-5 w-5" />} label="Requests (24h)" value={overview?.requests_last_24h ?? "—"} />
        <StatCard icon={<Database className="h-5 w-5" />} label="Watchlist Entries" value={overview?.total_watchlist_entries ?? "—"} />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">API Health</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {monitoring &&
            Object.entries(monitoring).map(([provider, stats]: [string, any]) => (
              <div key={provider} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{provider}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${stats.status === "healthy" ? "bg-green-400" : "bg-red-400"}`}
                  />
                </div>
                <p className="mt-2 text-xs text-mist">
                  Avg latency: {stats.avg_latency_ms}ms · Error rate: {(stats.error_rate * 100).toFixed(1)}%
                </p>
              </div>
            ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Cache Management</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {["jikan:top", "jikan:seasonal", "jikan:search", "anilist:trending"].map((prefix) => (
            <button
              key={prefix}
              onClick={() => invalidateCache(prefix)}
              disabled={busyPrefix === prefix}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-surface-hi px-4 py-2 text-sm hover:border-primary-400/40 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Flush {prefix}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="glass-card flex items-center gap-4 p-5">
      <div className="rounded-full bg-primary-600/20 p-3 text-primary-400">{icon}</div>
      <div>
        <p className="text-xs text-mist">{label}</p>
        <p className="font-display text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
