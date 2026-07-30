"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, Users, Trash2, ShieldOff, ShieldCheck, AlertTriangle, CheckCircle2, CircleDot, MessageCircle, ExternalLink, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Issue {
  id: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  slug: string;
  episode_number: number;
  body: string;
  tag: string;
  is_resolved: boolean;
  created_at: string;
}

interface AdminUser {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  created_at: string | null;
  has_google: boolean;
}

export default function AdminDashboardPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [busyPrefix, setBusyPrefix] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesTotal, setIssuesTotal] = useState(0);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issueFilter, setIssueFilter] = useState<"all" | "open" | "resolved">("open");
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  // User management state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isAdmin = user?.is_admin === true;

  useEffect(() => {
    const t = token || localStorage.getItem("anibinge_token");
    if (!t || !isAdmin) return;
    const headers = { Authorization: `Bearer ${t}` };
    fetch(`${API_BASE}/api/v1/admin/analytics/overview`, { headers }).then((r) => r.json()).then(setOverview);
    fetch(`${API_BASE}/api/v1/admin/api-monitoring`, { headers }).then((r) => r.json()).then(setMonitoring);
  }, [isAdmin, token]);

  useEffect(() => {
    const t = token || localStorage.getItem("anibinge_token");
    if (!t || !isAdmin) return;
    setIssuesLoading(true);
    const resolvedParam = issueFilter === "open" ? "false" : issueFilter === "resolved" ? "true" : "";
    const url = `${API_BASE}/api/v1/admin/issues${resolvedParam ? `?resolved=${resolvedParam}` : ""}`;
    fetch(url, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((data) => { setIssues(data.issues || []); setIssuesTotal(data.total || 0); })
      .catch(() => { setIssues([]); setIssuesTotal(0); })
      .finally(() => setIssuesLoading(false));
  }, [isAdmin, token, issueFilter]);

  async function handleResolveToggle(issueId: number) {
    const t = token || localStorage.getItem("anibinge_token");
    if (!t) return;
    setResolvingId(issueId);
    try {
      const res = await fetch(`${API_BASE}/api/v1/comments/${issueId}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIssues((prev) => prev.map((i) => i.id === issueId ? { ...i, is_resolved: data.is_resolved } : i));
        if (issueFilter !== "all") {
          setIssues((prev) => prev.filter((i) => i.id !== issueId));
          setIssuesTotal((p) => Math.max(0, p - 1));
        }
      }
    } catch (err) { console.error("Resolve failed:", err); }
    setResolvingId(null);
  }

  function getToken() {
    return token || localStorage.getItem("anibinge_token") || "";
  }

  async function invalidateCache(prefix: string) {
    setBusyPrefix(prefix);
    const t = getToken();
    await fetch(`${API_BASE}/api/v1/admin/cache/invalidate/${prefix}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
    });
    setBusyPrefix(null);
  }

  const fetchUsers = useCallback(async (q: string, p: number) => {
    const t = getToken();
    if (!t) return;
    setUsersLoading(true);
    try {
      const data = await api.adminListUsers(t, q, p);
      setUsers(data.users);
      setUsersTotal(data.total);
    } catch {
      setUsers([]);
      setUsersTotal(0);
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers(userSearch, userPage);
  }, [isAdmin, userSearch, userPage, fetchUsers]);

  async function handleDeleteUser(userId: string, username: string) {
    if (!confirm(`Delete user "${username}"? This also removes their watchlist, comments, and other data.`)) return;
    const t = getToken();
    if (!t) return;
    setDeletingId(userId);
    try {
      await api.adminDeleteUser(t, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setUsersTotal((p) => Math.max(0, p - 1));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete user");
    }
    setDeletingId(null);
  }

  async function handleToggleAdmin(userId: string, currently: boolean) {
    const t = getToken();
    if (!t) return;
    setTogglingId(userId);
    try {
      await api.adminSetAdmin(t, userId, !currently);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_admin: !currently } : u));
    } catch (err) {
      console.error("Toggle admin failed:", err);
      alert("Failed to change admin status");
    }
    setTogglingId(null);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Admin Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total Users" value={overview?.total_users ?? "—"} />
        <StatCard icon={<Activity className="h-5 w-5" />} label="Requests (24h)" value={overview?.requests_last_24h ?? "—"} />
        <StatCard icon={<Database className="h-5 w-5" />} label="Watchlist Entries" value={overview?.total_watchlist_entries ?? "—"} />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Open Issues" value={issuesTotal} accent={issuesTotal > 0} />
      </div>

      {/* Issues Section */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="font-display text-lg font-semibold">User Issues & Reports</h2>
            {issuesTotal > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-400">{issuesTotal}</span>
            )}
          </div>
          <div className="flex gap-1.5">
            {(["open", "resolved", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setIssueFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition capitalize ${
                  issueFilter === f ? "bg-primary-600 text-white" : "text-mist/50 hover:text-mist hover:bg-white/5"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {issuesLoading ? (
          <div className="mt-4 text-sm text-mist/40">Loading issues…</div>
        ) : issues.length === 0 ? (
          <div className="mt-6 rounded-xl bg-white/[0.03] border border-white/5 p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-400/40" />
            <p className="mt-3 text-sm text-mist/40">
              {issueFilter === "open" ? "No open issues. All clear!" : "No issues found."}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl px-4 py-3 border transition ${
                  issue.is_resolved
                    ? "bg-green-500/5 border-green-500/10 opacity-70"
                    : issue.tag === "issue"
                    ? "bg-red-500/5 border-red-500/10"
                    : "bg-amber-500/5 border-amber-500/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-paper uppercase">
                    {issue.username?.[0] || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-paper">{issue.username}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        issue.tag === "issue" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {issue.tag === "issue" ? "Not Working" : "Report"}
                      </span>
                      {issue.is_resolved && (
                        <span className="flex items-center gap-0.5 rounded-md bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
                        </span>
                      )}
                      <span className="text-[11px] text-mist/30">
                        {new Date(issue.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-mist leading-relaxed">{issue.body}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <a
                        href={`/watch/${issue.slug}?ep=${issue.episode_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300"
                      >
                        {issue.slug} ep {issue.episode_number} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={() => handleResolveToggle(issue.id)}
                    disabled={resolvingId === issue.id}
                    className={`shrink-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      issue.is_resolved
                        ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                        : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    } disabled:opacity-50`}
                  >
                    {resolvingId === issue.id ? "..." : issue.is_resolved ? "Unresolve" : "Resolve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

      {/* --- User Management --- */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-400" />
            <h2 className="font-display text-lg font-semibold">User Management</h2>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-mist">{usersTotal}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist/50" />
            <input
              type="text"
              placeholder="Search email or username..."
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
              className="w-56 rounded-lg border border-white/10 bg-surface-hi py-2 pl-9 pr-3 text-sm text-paper placeholder:text-mist/40 outline-none focus:border-primary-400/40"
            />
            {userSearch && (
              <button onClick={() => { setUserSearch(""); setUserPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-mist/50 hover:text-mist">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-mist/50">
                <th className="pb-2 pr-4 font-medium">Username</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Joined</th>
                <th className="pb-2 pr-4 font-medium">Auth</th>
                <th className="pb-2 pr-4 font-medium">Admin</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr><td colSpan={6} className="py-8 text-center text-mist/40">Loading users…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-mist/40">No users found.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-3 pr-4 font-medium text-paper">{u.username}</td>
                  <td className="py-3 pr-4 text-mist">{u.email}</td>
                  <td className="py-3 pr-4 text-mist/60 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${u.has_google ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {u.has_google ? "Google" : "Email"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {u.is_admin
                      ? <ShieldCheck className="h-4 w-4 text-green-400" />
                      : <ShieldOff className="h-4 w-4 text-mist/30" />
                    }
                  </td>
                  <td className="py-3 flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                      disabled={togglingId === u.id || u.id === user?.id}
                      title={u.id === user?.id ? "You cannot change your own admin status" : u.is_admin ? "Demote from admin" : "Promote to admin"}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed bg-white/5 text-mist hover:bg-white/10"
                    >
                      {togglingId === u.id ? "..." : u.is_admin ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      disabled={deletingId === u.id || u.id === user?.id}
                      title={u.id === user?.id ? "Cannot delete yourself" : "Delete user"}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      {deletingId === u.id ? "..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {usersTotal > 50 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setUserPage((p) => Math.max(1, p - 1))}
              disabled={userPage <= 1}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-white/5 text-mist hover:bg-white/10 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-xs text-mist/50">Page {userPage} of {Math.ceil(usersTotal / 50)}</span>
            <button
              onClick={() => setUserPage((p) => p + 1)}
              disabled={userPage * 50 >= usersTotal}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-white/5 text-mist hover:bg-white/10 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
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

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: any; accent?: boolean }) {
  return (
    <div className={`glass-card flex items-center gap-4 p-5 ${accent ? "ring-1 ring-amber-400/30" : ""}`}>
      <div className={`rounded-full ${accent ? "bg-amber-500/20 text-amber-400" : "bg-primary-600/20 text-primary-400"} p-3`}>{icon}</div>
      <div>
        <p className="text-xs text-mist">{label}</p>
        <p className="font-display text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
