"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, BellOff, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";

export function NotificationBell() {
  const { unreadCount, latestArticles, markAsRead, enablePush, disablePush, requestPermission, pushEnabled, pushPermission } = useNotifications();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    setPushError(null);
  };

  const handleMarkRead = () => {
    markAsRead();
    setOpen(false);
  };

  const handleTogglePush = async () => {
    if (pushPermission === "default") {
      try {
        const result = await requestPermission();
        if (result !== "granted") {
          setPushError("Permission not granted.");
          return;
        }
      } catch {
        setPushError("Permission request failed.");
        return;
      }
    }

    setToggling(true);
    setPushError(null);
    try {
      if (pushEnabled) {
        await disablePush();
      } else {
        const success = await enablePush();
        if (!success) {
          const perm = typeof Notification !== "undefined" ? Notification.permission : "unknown";
          if (perm === "denied") {
            setPushError("Notifications blocked. Enable in browser settings.");
          } else {
            setPushError("Could not enable notifications.");
          }
        }
      }
    } catch {
      setPushError("Something went wrong.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        onClick={handleOpen}
        className="relative rounded-full p-2 text-mist transition-colors hover:bg-white/5 hover:text-paper"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl sm:w-96">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-paper">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkRead}
                  className="text-xs text-primary-400 hover:text-primary-300"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Push notification toggle */}
          {token && (
            <div className="border-b border-white/5 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist">Push notifications</span>
                <button
                  onClick={handleTogglePush}
                  disabled={toggling || pushPermission === "denied" || pushPermission === "unsupported"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    pushEnabled
                      ? "bg-primary-600/20 text-primary-400 hover:bg-primary-600/30"
                      : "bg-white/5 text-mist hover:bg-white/10",
                    pushPermission === "denied" && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {toggling ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : pushEnabled ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <BellOff className="h-3 w-3" />
                  )}
                  {pushPermission === "denied" ? "Blocked" : pushPermission === "unsupported" ? "N/A" : pushEnabled ? "On" : "Off"}
                </button>
              </div>
              {pushError && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-400">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" /> {pushError}
                </p>
              )}
              {pushPermission === "denied" && (
                <p className="mt-1.5 text-[11px] text-red-400">
                  Notifications blocked. Enable in browser settings.
                </p>
              )}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {latestArticles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-mist">No articles yet.</p>
            ) : (
              latestArticles.slice(0, 10).map((article) => {
                const isUnread =
                  article.published_at &&
                  lastSeenRef() !== null &&
                  new Date(article.published_at).getTime() > lastSeenRef()!;
                return (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "block border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5",
                      isUnread && "bg-primary-600/5"
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-medium text-paper">
                      {isUnread && (
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary-400 align-middle" />
                      )}
                      {article.title}
                    </p>
                    {article.summary && (
                      <p className="mt-1 line-clamp-1 text-xs text-mist">{article.summary}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-mist">
                        {article.category}
                      </span>
                      {article.published_at && (
                        <span className="text-[10px] text-mist">
                          {formatRelativeTime(article.published_at)}
                        </span>
                      )}
                    </div>
                  </a>
                );
              })
            )}
          </div>

          <a
            href="/news"
            onClick={() => setOpen(false)}
            className="block border-t border-white/10 px-4 py-2.5 text-center text-xs font-medium text-primary-400 transition-colors hover:bg-white/5"
          >
            View all news →
          </a>
        </div>
      )}
    </div>
  );
}

function lastSeenRef(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("anibinge:lastSeenNews");
  return raw ? Number(raw) : null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
